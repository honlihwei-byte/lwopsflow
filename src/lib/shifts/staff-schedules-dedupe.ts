import type { createAdminClient } from "@/lib/supabase/admin";
import { sortSchedulesForDay } from "@/lib/shifts/multi-shift-match";
import {
  cancelStaffSchedule,
  listActiveSchedulesForStaffDay,
  type StaffScheduleRow,
} from "@/lib/shifts/staff-schedules-db";
import { getScheduleType } from "@/lib/shifts/schedule-type";

type Supabase = ReturnType<typeof createAdminClient>;

export type ScheduleDedupeResult = {
  shop_id: string;
  staff_id: string;
  shift_date: string;
  kept_id: string;
  cancelled_ids: string[];
};

function rowSignature(row: StaffScheduleRow): string {
  const type = getScheduleType(row);
  return [
    type,
    row.sequence_no ?? 1,
    row.start_time ?? "",
    row.end_time ?? "",
    row.template_id ?? "",
  ].join("|");
}

/** Remove only exact duplicate rows (same type, times, sequence) — never collapse multi-shift. */
export async function dedupeExactDuplicateSchedulesForCell(
  supabase: Supabase,
  params: { shop_id: string; staff_id: string; shift_date: string },
): Promise<ScheduleDedupeResult | null> {
  const active = await listActiveSchedulesForStaffDay(supabase, params);
  if (active.length <= 1) return null;

  const seen = new Map<string, StaffScheduleRow>();
  const losers: StaffScheduleRow[] = [];

  for (const row of active) {
    const sig = rowSignature(row);
    const prev = seen.get(sig);
    if (!prev) {
      seen.set(sig, row);
      continue;
    }
    const keep =
      new Date(row.updated_at).getTime() > new Date(prev.updated_at).getTime() ? row : prev;
    const drop = keep.id === row.id ? prev : row;
    seen.set(sig, keep);
    losers.push(drop);
  }

  if (losers.length === 0) return null;

  for (const row of losers) {
    await cancelStaffSchedule(supabase, row.id);
  }

  const winner = [...seen.values()][0]!;
  const result: ScheduleDedupeResult = {
    shop_id: params.shop_id,
    staff_id: params.staff_id,
    shift_date: params.shift_date,
    kept_id: winner.id,
    cancelled_ids: losers.map((row) => row.id),
  };

  console.info("[schedule-dedupe] removed exact duplicates", result);
  return result;
}

/** @deprecated Use dedupeExactDuplicateSchedulesForCell */
export const dedupeActiveSchedulesForCell = dedupeExactDuplicateSchedulesForCell;

/** Repair exact duplicate rows for one shop in a date range. */
export async function repairDuplicateSchedulesForShopInRange(
  supabase: Supabase,
  params: {
    company_id: string;
    shop_id: string;
    from: string;
    to: string;
  },
): Promise<{ repaired_cells: number; results: ScheduleDedupeResult[] }> {
  const { data, error } = await supabase
    .from("staff_schedules")
    .select("staff_id, shift_date")
    .eq("company_id", params.company_id)
    .eq("shop_id", params.shop_id)
    .eq("status", "active")
    .gte("shift_date", params.from)
    .lte("shift_date", params.to);

  if (error) throw new Error(error.message);

  const cellKeys = new Map<string, { staff_id: string; shift_date: string }>();
  for (const row of data ?? []) {
    const staff_id = String(row.staff_id);
    const shift_date = String(row.shift_date);
    cellKeys.set(`${staff_id}:${shift_date}`, { staff_id, shift_date });
  }

  const results: ScheduleDedupeResult[] = [];
  for (const cell of cellKeys.values()) {
    const deduped = await dedupeExactDuplicateSchedulesForCell(supabase, {
      shop_id: params.shop_id,
      staff_id: cell.staff_id,
      shift_date: cell.shift_date,
    });
    if (deduped) results.push(deduped);
  }

  return { repaired_cells: results.length, results };
}

/** All active rows for a cell, sorted for display/matching. */
export function allActiveScheduleRows(rows: StaffScheduleRow[]): StaffScheduleRow[] {
  return sortSchedulesForDay(rows.filter((row) => row.status === "active"));
}

/** @deprecated Use allActiveScheduleRows — returns all shifts, not one winner. */
export function canonicalActiveScheduleRow(rows: StaffScheduleRow[]): StaffScheduleRow | null {
  const active = allActiveScheduleRows(rows);
  return active[0] ?? null;
}

/** Group active rows by staff + date (each group may contain multiple shifts). */
export function groupActiveSchedulesByCell(rows: StaffScheduleRow[]): StaffScheduleRow[][] {
  const cells = new Map<string, StaffScheduleRow[]>();
  for (const row of rows) {
    if (row.status !== "active") continue;
    const key = `${row.staff_id}:${row.shift_date}`;
    const list = cells.get(key) ?? [];
    list.push(row);
    cells.set(key, list);
  }
  return [...cells.values()].map((cell) => allActiveScheduleRows(cell));
}

/** Flat list of all active rows grouped by cell (multi-shift safe). */
export function uniqueActiveCells(rows: StaffScheduleRow[]): StaffScheduleRow[] {
  return groupActiveSchedulesByCell(rows).flat();
}
