import type { ScheduleMode, ScheduleSlot, StaffScheduleProfile } from "@/lib/staff-schedule";
import { defaultStaffSchedule } from "@/lib/staff-schedule";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const STAFF_SCHEDULE_SELECT =
  "id, schedule_mode, default_start_time, default_end_time, schedule_timezone, phone, allow_punch, reporting_manager";

function timeFromDb(v: unknown): string {
  if (v == null) return "09:00";
  const s = String(v);
  return s.length >= 5 ? s.slice(0, 5) : "09:00";
}

export function profileFromStaffRow(
  row: Record<string, unknown>,
  slots: ScheduleSlot[],
): StaffScheduleProfile {
  return {
    schedule_mode: (row.schedule_mode as ScheduleMode) ?? "fixed_daily",
    default_start_time: timeFromDb(row.default_start_time),
    default_end_time: timeFromDb(row.default_end_time),
    schedule_timezone: String(row.schedule_timezone ?? "Asia/Kuala_Lumpur"),
    slots,
  };
}

export async function loadStaffSchedule(
  supabase: Supabase,
  staffId: string,
): Promise<StaffScheduleProfile> {
  const { data: staff, error } = await supabase
    .from("staff")
    .select(STAFF_SCHEDULE_SELECT)
    .eq("id", staffId)
    .maybeSingle();

  if (error || !staff) return defaultStaffSchedule();

  const { data: slotRows } = await supabase
    .from("staff_schedule_slots")
    .select("id, day_of_week, schedule_date, biweekly_week, start_time, end_time")
    .eq("staff_id", staffId)
    .order("day_of_week", { ascending: true });

  const slots: ScheduleSlot[] = (slotRows ?? []).map((r) => ({
    id: String(r.id),
    day_of_week: r.day_of_week != null ? Number(r.day_of_week) : null,
    schedule_date: r.schedule_date != null ? String(r.schedule_date) : null,
    biweekly_week: r.biweekly_week != null ? Number(r.biweekly_week) : null,
    start_time: timeFromDb(r.start_time),
    end_time: timeFromDb(r.end_time),
  }));

  return profileFromStaffRow(staff as Record<string, unknown>, slots);
}

export async function loadSchedulesForStaffIds(
  supabase: Supabase,
  staffIds: string[],
): Promise<Map<string, StaffScheduleProfile>> {
  const map = new Map<string, StaffScheduleProfile>();
  if (staffIds.length === 0) return map;

  const { data: staffRows } = await supabase
    .from("staff")
    .select(STAFF_SCHEDULE_SELECT)
    .in("id", staffIds);

  const { data: slotRows } = await supabase
    .from("staff_schedule_slots")
    .select("staff_id, id, day_of_week, schedule_date, biweekly_week, start_time, end_time")
    .in("staff_id", staffIds);

  const slotsByStaff = new Map<string, ScheduleSlot[]>();
  for (const r of slotRows ?? []) {
    const sid = String(r.staff_id);
    const list = slotsByStaff.get(sid) ?? [];
    list.push({
      id: String(r.id),
      day_of_week: r.day_of_week != null ? Number(r.day_of_week) : null,
      schedule_date: r.schedule_date != null ? String(r.schedule_date) : null,
      biweekly_week: r.biweekly_week != null ? Number(r.biweekly_week) : null,
      start_time: timeFromDb(r.start_time),
      end_time: timeFromDb(r.end_time),
    });
    slotsByStaff.set(sid, list);
  }

  for (const row of staffRows ?? []) {
    const id = String(row.id);
    map.set(id, profileFromStaffRow(row as Record<string, unknown>, slotsByStaff.get(id) ?? []));
  }

  return map;
}

export async function saveStaffSchedule(
  supabase: Supabase,
  staffId: string,
  profile: StaffScheduleProfile,
  extra?: {
    phone?: string | null;
    allow_punch?: boolean;
    reporting_manager?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    schedule_mode: profile.schedule_mode,
    default_start_time: profile.default_start_time,
    default_end_time: profile.default_end_time,
    schedule_timezone: profile.schedule_timezone,
    updated_at: new Date().toISOString(),
  };
  if (extra?.phone !== undefined) patch.phone = extra.phone;
  if (extra?.allow_punch !== undefined) patch.allow_punch = extra.allow_punch;
  if (extra?.reporting_manager !== undefined) patch.reporting_manager = extra.reporting_manager;

  await supabase.from("staff").update(patch).eq("id", staffId);

  await supabase.from("staff_schedule_slots").delete().eq("staff_id", staffId);

  if (profile.schedule_mode === "fixed_daily" || profile.slots.length === 0) return;

  const inserts = profile.slots.map((s) => ({
    staff_id: staffId,
    day_of_week: s.day_of_week,
    schedule_date: s.schedule_date,
    biweekly_week: s.biweekly_week,
    start_time: s.start_time,
    end_time: s.end_time,
  }));

  if (inserts.length > 0) {
    const { error } = await supabase.from("staff_schedule_slots").insert(inserts);
    if (error) throw new Error(error.message);
  }
}

export function parseScheduleFromBody(body: Record<string, unknown>): StaffScheduleProfile {
  const mode = String(body.schedule_mode ?? "fixed_daily") as ScheduleMode;
  const slotsRaw = Array.isArray(body.schedule_slots) ? body.schedule_slots : [];
  const slots: ScheduleSlot[] = slotsRaw.map((s: Record<string, unknown>) => ({
    day_of_week: s.day_of_week != null ? Number(s.day_of_week) : null,
    schedule_date: s.schedule_date != null ? String(s.schedule_date) : null,
    biweekly_week: s.biweekly_week != null ? Number(s.biweekly_week) : null,
    start_time: String(s.start_time ?? "09:00").slice(0, 5),
    end_time: String(s.end_time ?? "18:00").slice(0, 5),
  }));

  return {
    schedule_mode: mode,
    default_start_time: String(body.default_start_time ?? "09:00").slice(0, 5),
    default_end_time: String(body.default_end_time ?? "18:00").slice(0, 5),
    schedule_timezone: String(body.schedule_timezone ?? "Asia/Kuala_Lumpur"),
    slots,
  };
}
