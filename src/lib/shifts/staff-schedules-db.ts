import type { createAdminClient } from "@/lib/supabase/admin";
import {
  isOffDayScheduleLabel,
  isScheduleStatusCode,
  resolveScheduleStatusCode,
} from "@/lib/shifts/schedule-off-day";
import {
  getScheduleType,
  isNonShiftScheduleType,
  isShiftScheduleType,
  type ScheduleType,
} from "@/lib/shifts/schedule-type";
import { dedupeExactDuplicateSchedulesForCell } from "@/lib/shifts/staff-schedules-dedupe";
import {
  SCHEDULE_SELECT_BASE,
  SCHEDULE_SELECT_FULL,
  isMissingSchemaColumnError,
  scheduleSelectNeedsLegacyFallback,
} from "@/lib/shifts/staff-schedules-select";
import { sortSchedulesForDay } from "@/lib/shifts/multi-shift-match";

type Supabase = ReturnType<typeof createAdminClient>;

export type RepeatType = "one_day" | "weekly" | "bi_weekly" | "monthly";
export type ScheduleStatus = "active" | "cancelled";

export type StaffScheduleRow = {
  id: string;
  company_id: string | null;
  shop_id: string;
  staff_id: string;
  shift_date: string; // YYYY-MM-DD
  schedule_type: ScheduleType;
  start_time: string | null; // HH:mm:ss (or HH:mm)
  end_time: string | null;
  break_minutes: number;
  repeat_type: RepeatType;
  template_id: string | null;
  is_off_day: boolean;
  sequence_no: number;
  created_by: string | null;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
};

/** Parse HH:mm for DB time columns — never accept leave/status codes. */
function hhmmTimeOnly(v: string | null | undefined, fallback = "09:00"): string {
  const s = String(v ?? "").trim();
  if (!s || isScheduleStatusCode(s) || isOffDayScheduleLabel(s)) return fallback;
  if (s.length >= 5) return s.slice(0, 5);
  return fallback;
}

export function normalizeScheduleRow(row: Record<string, unknown>): StaffScheduleRow {
  const rawStart = row.start_time != null ? String(row.start_time).trim() : "";
  const rawEnd = row.end_time != null ? String(row.end_time).trim() : "";
  const rawType = row.schedule_type != null ? String(row.schedule_type).trim().toUpperCase() : "";
  const typeFromColumn: ScheduleType | "" =
    rawType === "NS"
      ? "NOT_SCHEDULED"
      : rawType === "SHIFT" ||
          rawType === "RD" ||
          rawType === "MC" ||
          rawType === "AL" ||
          rawType === "UL" ||
          rawType === "EL" ||
          rawType === "NOT_SCHEDULED"
        ? (rawType as ScheduleType)
        : "";
  const legacyCode = resolveScheduleStatusCode(rawStart, rawEnd, row.is_off_day === true);
  let schedule_type: ScheduleType = typeFromColumn
    ? typeFromColumn
    : legacyCode
      ? legacyCode === "NS"
        ? "NOT_SCHEDULED"
        : (legacyCode as ScheduleType)
      : rawStart && rawEnd && !isScheduleStatusCode(rawStart) && !isScheduleStatusCode(rawEnd)
        ? "SHIFT"
        : "NOT_SCHEDULED";

  if (
    schedule_type === "SHIFT" &&
    (!row.start_time || !row.end_time || isScheduleStatusCode(rawStart) || isScheduleStatusCode(rawEnd))
  ) {
    schedule_type = legacyCode
      ? legacyCode === "NS"
        ? "NOT_SCHEDULED"
        : (legacyCode as ScheduleType)
      : "NOT_SCHEDULED";
  }

  const isNonWorking = isNonShiftScheduleType(schedule_type);

  return {
    id: String(row.id),
    company_id: row.company_id != null ? String(row.company_id) : null,
    shop_id: String(row.shop_id),
    staff_id: String(row.staff_id),
    shift_date: String(row.shift_date),
    schedule_type,
    start_time: isNonWorking
      ? null
      : row.start_time != null
        ? hhmmTimeOnly(String(row.start_time)) || null
        : null,
    end_time: isNonWorking
      ? null
      : row.end_time != null
        ? hhmmTimeOnly(String(row.end_time)) || null
        : null,
    break_minutes: typeof row.break_minutes === "number" ? row.break_minutes : Number(row.break_minutes ?? 0) || 0,
    repeat_type: (row.repeat_type as RepeatType) ?? "one_day",
    template_id: row.template_id != null ? String(row.template_id) : null,
    is_off_day: isNonWorking,
    sequence_no:
      typeof row.sequence_no === "number"
        ? row.sequence_no
        : Number(row.sequence_no ?? 1) || 1,
    created_by: row.created_by != null ? String(row.created_by) : null,
    status: (row.status as ScheduleStatus) ?? "active",
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

const SCHEDULE_SELECT = SCHEDULE_SELECT_FULL;

type ScheduleQueryResult = { data: unknown[] | null; error: { message?: string; code?: string } | null };

async function runScheduleSelectQuery(
  run: (select: string) => PromiseLike<ScheduleQueryResult>,
): Promise<unknown[]> {
  const full = await run(SCHEDULE_SELECT_FULL);
  if (!full.error) return full.data ?? [];
  if (scheduleSelectNeedsLegacyFallback(full.error)) {
    const legacy = await run(SCHEDULE_SELECT_BASE);
    if (legacy.error) throw new Error(legacy.error.message ?? "Schedule query failed");
    return legacy.data ?? [];
  }
  throw new Error(full.error.message ?? "Schedule query failed");
}

function stripOptionalScheduleInsertFields(
  insert: Record<string, unknown>,
): Record<string, unknown> {
  const { schedule_type: _t, sequence_no: _s, ...rest } = insert;
  return rest;
}

async function insertStaffScheduleRow(
  supabase: Supabase,
  insert: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let result = await supabase.from("staff_schedules").insert(insert).select(SCHEDULE_SELECT_FULL).single();
  if (result.error && isMissingSchemaColumnError(result.error, "schedule_type")) {
    result = await supabase
      .from("staff_schedules")
      .insert(stripOptionalScheduleInsertFields(insert))
      .select(SCHEDULE_SELECT_BASE)
      .single();
  } else if (result.error && isMissingSchemaColumnError(result.error, "sequence_no")) {
    const withoutSeq = { ...insert };
    delete withoutSeq.sequence_no;
    result = await supabase.from("staff_schedules").insert(withoutSeq).select(SCHEDULE_SELECT_BASE).single();
  }
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "Could not create schedule");
  }
  return result.data as Record<string, unknown>;
}

async function updateStaffScheduleRow(
  supabase: Supabase,
  scheduleId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let result = await supabase
    .from("staff_schedules")
    .update(updates)
    .eq("id", scheduleId)
    .select(SCHEDULE_SELECT_FULL)
    .single();
  if (result.error && isMissingSchemaColumnError(result.error, "schedule_type")) {
    result = await supabase
      .from("staff_schedules")
      .update(stripOptionalScheduleInsertFields(updates))
      .eq("id", scheduleId)
      .select(SCHEDULE_SELECT_BASE)
      .single();
  }
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "Could not update schedule");
  }
  return result.data as Record<string, unknown>;
}

export function isWorkingShiftScheduleRow(row: {
  is_off_day?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
}): boolean {
  if (row.is_off_day) return false;
  const start = row.start_time != null ? String(row.start_time).trim() : "";
  const end = row.end_time != null ? String(row.end_time).trim() : "";
  if (!start || !end) return false;
  if (isScheduleStatusCode(start) || isScheduleStatusCode(end)) return false;
  return true;
}

export async function listStaffSchedules(
  supabase: Supabase,
  params: {
    companyId: string | null;
    shopId?: string | null;
    staffId?: string | null;
    from: string; // ymd
    to: string; // ymd
  },
): Promise<StaffScheduleRow[]> {
  const data = await runScheduleSelectQuery((select) => {
    let q = supabase
      .from("staff_schedules")
      .select(select)
      .gte("shift_date", params.from)
      .lte("shift_date", params.to)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (params.companyId) q = q.eq("company_id", params.companyId);
    if (params.shopId) q = q.eq("shop_id", params.shopId);
    if (params.staffId) q = q.eq("staff_id", params.staffId);

    return q.then((r) => ({ data: r.data, error: r.error }));
  });
  return data.map((r) => normalizeScheduleRow(r as Record<string, unknown>));
}

/** Active schedules for many staff in a date range (all shops). */
export async function listStaffSchedulesForStaffIds(
  supabase: Supabase,
  params: {
    companyId: string;
    staffIds: string[];
    from: string;
    to: string;
  },
): Promise<StaffScheduleRow[]> {
  if (params.staffIds.length === 0) return [];

  const data = await runScheduleSelectQuery((select) =>
    supabase
      .from("staff_schedules")
      .select(select)
      .eq("company_id", params.companyId)
      .in("staff_id", params.staffIds)
      .gte("shift_date", params.from)
      .lte("shift_date", params.to)
      .eq("status", "active")
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true })
      .then((r) => ({ data: r.data, error: r.error })),
  );
  return data.map((r) => normalizeScheduleRow(r as Record<string, unknown>));
}

export async function getShopNamesByIds(
  supabase: Supabase,
  shopIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (shopIds.length === 0) return out;
  const { data, error } = await supabase.from("shops").select("id, name").in("id", shopIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    out.set(String(row.id), String(row.name ?? "").trim() || "Shop");
  }
  return out;
}

export type CrossShopScheduleRow = StaffScheduleRow & { shop_name: string };

export async function loadSchedulesForStaffIdsInRange(
  supabase: Supabase,
  params: {
    staffIds: string[];
    from: string;
    to: string;
  },
): Promise<Map<string, Map<string, StaffScheduleRow[]>>> {
  const out = new Map<string, Map<string, StaffScheduleRow[]>>();
  if (params.staffIds.length === 0) return out;

  const data = await runScheduleSelectQuery((select) =>
    supabase
      .from("staff_schedules")
      .select(select)
      .in("staff_id", params.staffIds)
      .gte("shift_date", params.from)
      .lte("shift_date", params.to)
      .eq("status", "active")
      .then((r) => ({ data: r.data, error: r.error })),
  );
  for (const r of data) {
    const row = normalizeScheduleRow(r as Record<string, unknown>);
    let staffMap = out.get(row.staff_id);
    if (!staffMap) {
      staffMap = new Map<string, StaffScheduleRow[]>();
      out.set(row.staff_id, staffMap);
    }
    const existing = staffMap.get(row.shift_date) ?? [];
    existing.push(row);
    staffMap.set(row.shift_date, sortSchedulesForDay(existing));
  }
  return out;
}

export async function cancelActiveSchedulesForDay(
  supabase: Supabase,
  params: { shop_id: string; staff_id: string; shift_date: string },
): Promise<void> {
  const { error } = await supabase
    .from("staff_schedules")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("shop_id", params.shop_id)
    .eq("staff_id", params.staff_id)
    .eq("shift_date", params.shift_date)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

/** Cancel only timed SHIFT rows for a cell (preserves other shifts when replacing status). */
export async function cancelActiveShiftSchedulesForDay(
  supabase: Supabase,
  params: { shop_id: string; staff_id: string; shift_date: string },
): Promise<void> {
  const { error } = await supabase
    .from("staff_schedules")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("shop_id", params.shop_id)
    .eq("staff_id", params.staff_id)
    .eq("shift_date", params.shift_date)
    .eq("status", "active")
    .eq("schedule_type", "SHIFT");
  if (error && isMissingSchemaColumnError(error, "schedule_type")) {
    const rows = await listActiveSchedulesForStaffDay(supabase, params);
    const shiftIds = rows
      .filter((r) => isShiftScheduleType(getScheduleType(r)))
      .map((r) => r.id);
    if (shiftIds.length === 0) return;
    const { error: cancelErr } = await supabase
      .from("staff_schedules")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("id", shiftIds);
    if (cancelErr) throw new Error(cancelErr.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function listActiveSchedulesForStaffDay(
  supabase: Supabase,
  params: { shop_id: string; staff_id: string; shift_date: string },
): Promise<StaffScheduleRow[]> {
  const fullResult = await supabase
    .from("staff_schedules")
    .select(SCHEDULE_SELECT_FULL)
    .eq("shop_id", params.shop_id)
    .eq("staff_id", params.staff_id)
    .eq("shift_date", params.shift_date)
    .eq("status", "active")
    .order("start_time", { ascending: true })
    .order("sequence_no", { ascending: true });

  let rows: Record<string, unknown>[] = (fullResult.data ?? []) as Record<string, unknown>[];
  let error = fullResult.error;

  if (error && scheduleSelectNeedsLegacyFallback(error)) {
    const legacyResult = await supabase
      .from("staff_schedules")
      .select(SCHEDULE_SELECT_BASE)
      .eq("shop_id", params.shop_id)
      .eq("staff_id", params.staff_id)
      .eq("shift_date", params.shift_date)
      .eq("status", "active")
      .order("start_time", { ascending: true });
    rows = (legacyResult.data ?? []) as Record<string, unknown>[];
    error = legacyResult.error;
  }

  if (error) throw new Error(error.message);
  return rows.map((r) => normalizeScheduleRow(r));
}

async function nextSequenceNo(
  supabase: Supabase,
  params: { shop_id: string; staff_id: string; shift_date: string },
): Promise<number> {
  const existing = await listActiveSchedulesForStaffDay(supabase, params);
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((r) => r.sequence_no ?? 1)) + 1;
}

/** Replace cell assignment: non-SHIFT cancels all rows; SHIFT replaces all SHIFT rows with one. */
export async function assignStaffScheduleDay(
  supabase: Supabase,
  row: Omit<StaffScheduleRow, "id" | "created_at" | "updated_at">,
): Promise<StaffScheduleRow> {
  const cell = {
    shop_id: row.shop_id,
    staff_id: row.staff_id,
    shift_date: row.shift_date,
  };

  const scheduleType = getScheduleType(row);
  if (isNonShiftScheduleType(scheduleType)) {
    await cancelActiveSchedulesForDay(supabase, cell);
    return createStaffSchedule(supabase, { ...row, schedule_type: scheduleType, sequence_no: 1 });
  }

  await cancelActiveShiftSchedulesForDay(supabase, cell);
  const created = await createStaffSchedule(supabase, { ...row, schedule_type: "SHIFT", sequence_no: 1 });
  await dedupeExactDuplicateSchedulesForCell(supabase, cell);
  return created;
}

/** Add another shift without cancelling existing rows. */
export async function addStaffScheduleShift(
  supabase: Supabase,
  row: Omit<StaffScheduleRow, "id" | "created_at" | "updated_at" | "sequence_no"> & {
    sequence_no?: number;
  },
): Promise<StaffScheduleRow> {
  const seq =
    row.sequence_no ??
    (await nextSequenceNo(supabase, {
      shop_id: row.shop_id,
      staff_id: row.staff_id,
      shift_date: row.shift_date,
    }));
  const scheduleType = getScheduleType(row);
  return createStaffSchedule(supabase, {
    ...row,
    schedule_type: scheduleType,
    sequence_no: seq,
  });
}

export async function createStaffSchedule(
  supabase: Supabase,
  row: Omit<StaffScheduleRow, "id" | "created_at" | "updated_at">,
): Promise<StaffScheduleRow> {
  const scheduleType = getScheduleType(row);
  const insert: Record<string, unknown> = {
    company_id: row.company_id,
    shop_id: row.shop_id,
    staff_id: row.staff_id,
    shift_date: row.shift_date,
    schedule_type: scheduleType,
    break_minutes: row.break_minutes,
    repeat_type: row.repeat_type,
    template_id: isShiftScheduleType(scheduleType) ? row.template_id : null,
    is_off_day: isNonShiftScheduleType(scheduleType),
    sequence_no: row.sequence_no ?? 1,
    created_by: row.created_by,
    status: row.status,
    updated_at: new Date().toISOString(),
  };
  if (isShiftScheduleType(scheduleType)) {
    if (isScheduleStatusCode(row.start_time) || isScheduleStatusCode(row.end_time)) {
      throw new Error("Leave/status codes cannot be saved into start_time or end_time");
    }
    if (!row.start_time?.trim() || !row.end_time?.trim()) {
      throw new Error("SHIFT requires start_time and end_time");
    }
    insert.start_time = hhmmTimeOnly(row.start_time, "09:00");
    insert.end_time = hhmmTimeOnly(row.end_time, "18:00");
  } else {
    insert.start_time = null;
    insert.end_time = null;
  }

  const data = await insertStaffScheduleRow(supabase, insert);
  return normalizeScheduleRow(data);
}

export async function updateStaffSchedule(
  supabase: Supabase,
  scheduleId: string,
  patch: Partial<
    Pick<
      StaffScheduleRow,
      | "shop_id"
      | "staff_id"
      | "shift_date"
      | "schedule_type"
      | "start_time"
      | "end_time"
      | "break_minutes"
      | "status"
      | "is_off_day"
    >
  >,
): Promise<StaffScheduleRow> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.shop_id !== undefined) updates.shop_id = patch.shop_id;
  if (patch.staff_id !== undefined) updates.staff_id = patch.staff_id;
  if (patch.shift_date !== undefined) updates.shift_date = patch.shift_date;
  if (patch.schedule_type !== undefined) {
    updates.schedule_type = patch.schedule_type;
    if (isNonShiftScheduleType(patch.schedule_type)) {
      updates.is_off_day = true;
      updates.start_time = null;
      updates.end_time = null;
    }
  }
  if (patch.start_time !== undefined) {
    updates.start_time =
      patch.start_time != null && !isScheduleStatusCode(patch.start_time)
        ? hhmmTimeOnly(patch.start_time)
        : null;
  }
  if (patch.end_time !== undefined) {
    updates.end_time =
      patch.end_time != null && !isScheduleStatusCode(patch.end_time)
        ? hhmmTimeOnly(patch.end_time)
        : null;
  }
  if (patch.break_minutes !== undefined) updates.break_minutes = patch.break_minutes;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.is_off_day !== undefined) {
    updates.is_off_day = patch.is_off_day;
    if (patch.is_off_day && patch.schedule_type === undefined) {
      updates.schedule_type = "RD";
      updates.start_time = null;
      updates.end_time = null;
    }
  }

  const data = await updateStaffScheduleRow(supabase, scheduleId, updates);
  return normalizeScheduleRow(data);
}

export async function cancelStaffSchedule(
  supabase: Supabase,
  scheduleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("staff_schedules")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", scheduleId);
  if (error) throw new Error(error.message);
}

