import { firstClockIn, type AttendanceRecord } from "@/lib/attendance";
import { recordEventTime } from "@/lib/attendance-db";
import { isStaffScheduleWorkingShift } from "@/lib/shifts/schedule-off-day";
import { sortSchedulesForDay } from "@/lib/shifts/multi-shift-match";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

function parseHhmmToMinutes(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function hasEffectiveShiftTimes(row: StaffScheduleRow): boolean {
  return isStaffScheduleWorkingShift(row);
}

/**
 * All active timed working shifts for a staff day (never collapses to one row).
 * Optional shop filter only — does not narrow by punch shop.
 */
export function pickAllWorkingSchedulesForDay(params: {
  schedules: StaffScheduleRow[];
  shopIdFilter?: string | null;
}): StaffScheduleRow[] {
  let active = sortSchedulesForDay((params.schedules ?? []).filter((s) => s.status === "active"));
  if (params.shopIdFilter) {
    const atShop = active.filter((s) => s.shop_id === params.shopIdFilter);
    if (atShop.length > 0) active = atShop;
  }
  return active;
}

/**
 * Schedules eligible for attendance matching on a day.
 * Prefer: punch shop → admin shop filter → all active shifts.
 */
export function pickSchedulesForAttendanceDay(params: {
  schedules: StaffScheduleRow[];
  dayRows: AttendanceRecord[];
  shopIdFilter?: string | null;
}): StaffScheduleRow[] {
  const active = (params.schedules ?? []).filter(
    (s) => hasEffectiveShiftTimes(s),
  );
  if (active.length === 0) return [];

  const punchShopIds = new Set(params.dayRows.map((r) => r.shop_id).filter(Boolean));

  let candidates = active;
  if (punchShopIds.size > 0) {
    const atPunchShop = active.filter((s) => punchShopIds.has(s.shop_id));
    if (atPunchShop.length > 0) candidates = atPunchShop;
  }

  if (params.shopIdFilter) {
    const atFilterShop = candidates.filter((s) => s.shop_id === params.shopIdFilter);
    if (atFilterShop.length > 0) candidates = atFilterShop;
  }

  return candidates.sort((a, b) =>
    String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")),
  );
}

/** Single best schedule row for a staff day (shop + clock-in time aware). */
export function pickPrimaryScheduleForDay(params: {
  schedules: StaffScheduleRow[];
  dayRows: AttendanceRecord[];
  shopIdFilter?: string | null;
}): StaffScheduleRow | null {
  const candidates = pickSchedulesForAttendanceDay(params);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  const firstIn = firstClockIn(params.dayRows);
  const firstInMin = firstIn ? parseHhmmToMinutes(recordEventTime(firstIn)) : null;
  if (firstInMin != null) {
    let best: StaffScheduleRow | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const s of candidates) {
      const st = parseHhmmToMinutes(s.start_time);
      if (st == null) continue;
      const dist = Math.abs(st - firstInMin);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    if (best) return best;
  }

  return candidates[0]!;
}

/** True when staff has an active timed shift at a shop they punched at on this day. */
export function hasScheduledShiftForPunchDay(params: {
  schedules: StaffScheduleRow[];
  dayRows: AttendanceRecord[];
  shopIdFilter?: string | null;
}): boolean {
  return pickSchedulesForAttendanceDay(params).length > 0;
}
