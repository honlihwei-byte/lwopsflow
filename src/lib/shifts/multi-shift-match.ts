import {
  attendanceForTotals,
  computeWorkHoursWithBreaks,
  countedPunches,
  sortByEventTime,
  type AttendanceRecord,
} from "@/lib/attendance";
import { matchesEventDate, recordEventInstant } from "@/lib/attendance-db";
import { malaysiaDateYmd, parseMalaysiaEventInstant } from "@/lib/malaysia-time";
import {
  matchAttendanceToScheduledShift,
  type ShiftMatchResult,
  type ShiftMatchStatus,
} from "@/lib/shifts/shift-match";
import {
  attendanceStatusForScheduleRow,
  isFutureAttendanceDay,
  isStaffScheduleNonWorkingDay,
  isStaffScheduleWorkingShift,
} from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type PerShiftStatus = ShiftMatchStatus | "upcoming";

export type ShiftWindow = {
  schedule: StaffScheduleRow;
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  endGraceMs: number;
};

export type PerShiftDayResult = {
  schedule_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_clock_in: string | null;
  actual_clock_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  status: PerShiftStatus;
  missing_clock_out: boolean;
};

export type MultiShiftDayResult = ShiftMatchResult & {
  status: ShiftMatchStatus;
  shifts_today: number;
  attended_shifts: number;
  missed_shifts: number;
  current_shift: { start: string; end: string } | null;
  next_shift: { start: string; end: string } | null;
  scheduled_label: string | null;
  scheduled_label_lines: string[];
  per_shift: PerShiftDayResult[];
};

const GRACE_MINUTES = 30;
/** Punches may count toward a shift if within this many ms before shift start. */
const PRE_SHIFT_PAD_MS = 60 * 60_000;

function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s.length >= 5 ? s.slice(0, 5) : null;
}

export function sortSchedulesForDay(rows: StaffScheduleRow[]): StaffScheduleRow[] {
  return [...rows]
    .filter((r) => isStaffScheduleWorkingShift(r))
    .sort((a, b) => {
      const sa = String(a.start_time ?? "");
      const sb = String(b.start_time ?? "");
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.sequence_no ?? 1) - (b.sequence_no ?? 1);
    });
}

export function buildShiftWindows(ymd: string, schedules: StaffScheduleRow[]): ShiftWindow[] {
  const sorted = sortSchedulesForDay(schedules);
  return sorted.map((schedule) => {
    const start = hhmm(schedule.start_time)!;
    const end = hhmm(schedule.end_time)!;
    const startMs =
      parseMalaysiaEventInstant(ymd, `${start}:00`) ??
      new Date(`${ymd}T${start}:00+08:00`).getTime();
    let endMs =
      parseMalaysiaEventInstant(ymd, `${end}:00`) ??
      new Date(`${ymd}T${end}:00+08:00`).getTime();
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
    const endGraceMs = endMs + GRACE_MINUTES * 60_000;
    return { schedule, start, end, startMs, endMs, endGraceMs };
  });
}

export function scheduledLabel(windows: ShiftWindow[]): string | null {
  if (windows.length === 0) return null;
  return windows.map((w) => `${w.start}–${w.end}`).join(" + ");
}

export function scheduledLabelLines(windows: ShiftWindow[]): string[] {
  return windows.map((w) => `${w.start}–${w.end}`);
}

function isShiftAttended(ps: PerShiftDayResult): boolean {
  return Boolean(ps.actual_clock_in && ps.status !== "absent");
}

function isShiftMissed(
  ps: PerShiftDayResult,
  w: ShiftWindow,
  now: number,
  isToday: boolean,
  isFuture: boolean,
): boolean {
  if (isFuture) return false;
  const shiftEnded = !isToday || now > w.endGraceMs;
  if (!shiftEnded) return false;
  return !isShiftAttended(ps);
}

function countShiftAttendance(
  perShift: PerShiftDayResult[],
  windows: ShiftWindow[],
  now: number,
  isToday: boolean,
  isFuture: boolean,
): { attended: number; missed: number } {
  let attended = 0;
  let missed = 0;
  for (let i = 0; i < perShift.length; i++) {
    const ps = perShift[i]!;
    const w = windows[i]!;
    if (isShiftAttended(ps)) attended += 1;
    else if (isShiftMissed(ps, w, now, isToday, isFuture)) missed += 1;
  }
  return { attended, missed };
}

function finalizePastMultiShiftStatus(
  perShift: PerShiftDayResult[],
  windows: ShiftWindow[],
  now: number,
  isToday: boolean,
  ymd: string,
  fallback: ShiftMatchStatus,
): ShiftMatchStatus {
  if (isToday || isFutureAttendanceDay(ymd)) return fallback;
  const { attended, missed } = countShiftAttendance(perShift, windows, now, isToday, false);
  if (missed > 0 && attended > 0) return "partial_attendance";
  if (missed > 0 && attended === 0) return "absent";
  if (attended === perShift.length && perShift.length > 0) {
    if (perShift.every((p) => p.status === "on_time" || p.status === "completed")) return "completed";
    return fallback === "on_time" ? "completed" : fallback;
  }
  return fallback;
}

/** Punches attributed to a shift window (in/out near this shift only). */
export function punchesForShiftWindow(
  allDayRows: AttendanceRecord[],
  window: ShiftWindow,
): AttendanceRecord[] {
  const from = window.startMs - PRE_SHIFT_PAD_MS;
  const to = window.endGraceMs;
  return allDayRows.filter((r) => {
    const t = recordEventInstant(r);
    return t >= from && t <= to;
  });
}

function resolvePerShiftStatus(
  w: ShiftWindow,
  match: ShiftMatchResult,
  now: number,
  isToday: boolean,
  isFuture: boolean,
): PerShiftStatus {
  if (isFuture) return "upcoming";
  if (isToday && now < w.startMs) return "upcoming";

  const overdue = isToday ? now > w.endGraceMs : true;

  if (isToday && now >= w.startMs && now <= w.endGraceMs) {
    if (match.status === "open_shift") return "open_shift";
    if (match.missing_clock_out && overdue) return "missing_clock_out";
    if (match.status === "late") return "late";
    if (match.status === "early_leave") return "early_leave";
    if (match.actual_clock_in) return "in_shift";
    if (!match.actual_clock_in && !match.absent) return "in_shift";
    return match.status === "absent" ? "absent" : "in_shift";
  }

  if (overdue) {
    if (match.missing_clock_out) return "missing_clock_out";
    if (match.actual_clock_in && match.actual_clock_out) return "completed";
    if (!match.actual_clock_in) return "absent";
    return match.status === "late" ? "late" : match.status === "early_leave" ? "early_leave" : "completed";
  }

  return "upcoming";
}

function aggregateDayStatus(
  perShift: PerShiftDayResult[],
  windows: ShiftWindow[],
  now: number,
  isToday: boolean,
  dayRows: AttendanceRecord[],
): ShiftMatchStatus {
  if (perShift.some((p) => p.status === "missing_clock_out")) return "missing_clock_out";

  let currentIdx = -1;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    if (now >= w.startMs && now <= w.endGraceMs) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx >= 0) {
    const ps = perShift[currentIdx]!;
    if (ps.status === "open_shift") return "open_shift";
    if (ps.status === "in_shift" || ps.status === "late" || ps.status === "early_leave") {
      return ps.status === "late" ? "late" : ps.status === "early_leave" ? "early_leave" : "in_shift";
    }
    return "in_shift";
  }

  if (isToday) {
    for (let i = 0; i < windows.length - 1; i++) {
      const w = windows[i]!;
      const nextW = windows[i + 1]!;
      if (now > w.endGraceMs && now < nextW.startMs) {
        const prev = perShift[i]!;
        if (prev.status !== "missing_clock_out") return "waiting_for_next_shift";
      }
    }
  }

  const allPast = isToday && windows.every((w) => now > w.endGraceMs);
  if (
    allPast &&
    perShift.length > 0 &&
    perShift.every((p) => p.status === "completed" || p.status === "on_time")
  ) {
    return "completed";
  }

  if (dayRows.length === 0 && windows.length > 0 && isToday) {
    const nextUpcoming = windows.find((w) => now < w.endGraceMs);
    if (nextUpcoming && now < nextUpcoming.startMs) return "waiting_for_next_shift";
    if (windows.some((w) => now >= w.startMs && now <= w.endGraceMs)) return "on_time";
    if (windows.every((w) => now > w.endGraceMs)) return "absent";
    return "waiting_for_next_shift";
  }

  const last = perShift[perShift.length - 1];
  if (last?.status === "completed") return "completed";
  if (isToday && perShift.some((p) => p.status === "upcoming")) return "waiting_for_next_shift";

  return "on_time";
}

/** Match attendance for a day with one or more scheduled shifts. */
export function matchMultiShiftDay(params: {
  ymd: string;
  schedules: StaffScheduleRow[];
  history: AttendanceRecord[];
  nowMs?: number;
  shopIdFilter?: string | null;
}): MultiShiftDayResult {
  const dayRows = sortByEventTime(
    attendanceForTotals(params.history.filter((r) => matchesEventDate(r, params.ymd))),
  );
  const now = params.nowMs ?? Date.now();
  const isToday = params.ymd === malaysiaDateYmd(new Date());

  let schedules = params.schedules.filter((s) => s.status === "active");
  if (params.shopIdFilter) {
    schedules = schedules.filter((s) => s.shop_id === params.shopIdFilter);
  }

  const nonWorking = schedules.find((s) => isStaffScheduleNonWorkingDay(s));
  if (nonWorking) {
    const single = matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: null,
      scheduledEnd: null,
      scheduleLeaveStatus: attendanceStatusForScheduleRow(nonWorking),
      history: params.history,
    });
    return {
      ...single,
      status: single.status,
      shifts_today: 0,
      attended_shifts: 0,
      missed_shifts: 0,
      current_shift: null,
      next_shift: null,
      scheduled_label: null,
      scheduled_label_lines: [],
      per_shift: [],
    };
  }

  const windows = buildShiftWindows(params.ymd, schedules);
  const shiftsToday = windows.length;

  if (shiftsToday === 0) {
    const single = matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: null,
      scheduledEnd: null,
      history: params.history,
    });
    return {
      ...single,
      shifts_today: 0,
      attended_shifts: 0,
      missed_shifts: 0,
      current_shift: null,
      next_shift: null,
      scheduled_label: null,
      scheduled_label_lines: [],
      per_shift: [],
    };
  }

  const isFuture = isFutureAttendanceDay(params.ymd);

  const dayAllPunches = sortByEventTime(
    countedPunches(params.history.filter((r) => matchesEventDate(r, params.ymd))),
  );
  const fullDayWorkHours = computeWorkHoursWithBreaks(dayAllPunches);

  if (shiftsToday === 1) {
    const w = windows[0]!;
    const shiftRows = punchesForShiftWindow(dayRows, w);
    const single = matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: w.start,
      scheduledEnd: w.end,
      breakMinutes: w.schedule.break_minutes,
      history: shiftRows.length > 0 ? shiftRows : dayRows,
    });
    const ps: PerShiftDayResult = {
      schedule_id: w.schedule.id,
      scheduled_start: w.start,
      scheduled_end: w.end,
      actual_clock_in: single.actual_clock_in,
      actual_clock_out: single.actual_clock_out,
      late_minutes: isFuture ? 0 : single.late_minutes,
      early_leave_minutes: isFuture ? 0 : single.early_leave_minutes,
      status: resolvePerShiftStatus(w, single, now, isToday, isFuture),
      missing_clock_out: isFuture ? false : single.missing_clock_out,
    };
    let status: ShiftMatchStatus = isFuture
      ? "upcoming"
      : aggregateDayStatus([ps], windows, now, isToday, dayRows);
    if (!isFuture && status === "on_time" && ps.status === "completed") status = "completed";

    const { attended, missed } = countShiftAttendance([ps], windows, now, isToday, isFuture);

    const current =
      isToday && now >= w.startMs && now <= w.endGraceMs ? { start: w.start, end: w.end } : null;
    const next = isToday && now < w.startMs ? { start: w.start, end: w.end } : null;

    return {
      ...single,
      status,
      worked_hours_ms: fullDayWorkHours.workedMs,
      break_ms: fullDayWorkHours.breakMs,
      shifts_today: 1,
      attended_shifts: attended,
      missed_shifts: missed,
      current_shift: current,
      next_shift: next,
      scheduled_label: `${w.start}–${w.end}`,
      scheduled_label_lines: [`${w.start}–${w.end}`],
      per_shift: [ps],
    };
  }

  const perShift: PerShiftDayResult[] = windows.map((w) => {
    const shiftRows = punchesForShiftWindow(dayRows, w);
    const match = matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: w.start,
      scheduledEnd: w.end,
      breakMinutes: w.schedule.break_minutes,
      history: shiftRows,
    });
    const overdue = !isFuture && (isToday ? now > w.endGraceMs : true);
    const missing_clock_out = !isFuture && match.missing_clock_out && overdue;
    return {
      schedule_id: w.schedule.id,
      scheduled_start: w.start,
      scheduled_end: w.end,
      actual_clock_in: match.actual_clock_in,
      actual_clock_out: match.actual_clock_out,
      late_minutes: isFuture ? 0 : match.late_minutes,
      early_leave_minutes: isFuture ? 0 : match.early_leave_minutes,
      status: resolvePerShiftStatus(w, { ...match, missing_clock_out }, now, isToday, isFuture),
      missing_clock_out,
    };
  });

  let status = isFuture
    ? "upcoming"
    : finalizePastMultiShiftStatus(
        perShift,
        windows,
        now,
        isToday,
        params.ymd,
        aggregateDayStatus(perShift, windows, now, isToday, dayRows),
      );
  const { attended, missed } = countShiftAttendance(perShift, windows, now, isToday, isFuture);
  const workHours = fullDayWorkHours;

  let currentIdx = -1;
  for (let i = 0; i < windows.length; i++) {
    if (now >= windows[i]!.startMs && now <= windows[i]!.endGraceMs) {
      currentIdx = i;
      break;
    }
  }

  let current_shift: { start: string; end: string } | null = null;
  let next_shift: { start: string; end: string } | null = null;

  if (currentIdx >= 0) {
    current_shift = {
      start: windows[currentIdx]!.start,
      end: windows[currentIdx]!.end,
    };
  } else if (status === "waiting_for_next_shift") {
    const nextW = windows.find((w) => now < w.startMs);
    if (nextW) next_shift = { start: nextW.start, end: nextW.end };
  } else if (status === "completed") {
    current_shift = null;
    next_shift = null;
  } else if (isToday) {
    const nextW = windows.find((w) => now < w.startMs);
    if (nextW) next_shift = { start: nextW.start, end: nextW.end };
  }

  const activeIdx = currentIdx >= 0 ? currentIdx : 0;
  const activePs = perShift[activeIdx] ?? perShift[0]!;

  const first = windows[0]!;
  const last = windows[windows.length - 1]!;
  const schedMs =
    windows.reduce((sum, w) => sum + Math.max(0, w.endMs - w.startMs), 0) -
    windows.reduce((sum, w) => sum + (w.schedule.break_minutes ?? 0) * 60_000, 0);

  return {
    date: params.ymd,
    scheduled_start: first.start,
    scheduled_end: last.end,
    actual_clock_in: activePs.actual_clock_in,
    actual_clock_out: activePs.actual_clock_out,
    late_minutes: currentIdx >= 0 ? perShift[currentIdx]!.late_minutes : 0,
    early_leave_minutes: currentIdx >= 0 ? perShift[currentIdx]!.early_leave_minutes : 0,
    overtime_minutes: 0,
    missing_clock_in: perShift.some((p) => p.status === "missing_clock_in"),
    missing_clock_out: perShift.some((p) => p.missing_clock_out),
    absent: !isFuture && missed > 0 && attended === 0,
    scheduled_hours_ms: isFuture ? 0 : Math.max(0, schedMs),
    worked_hours_ms: workHours.workedMs,
    break_ms: workHours.breakMs,
    status,
    shifts_today: shiftsToday,
    attended_shifts: attended,
    missed_shifts: missed,
    current_shift,
    next_shift,
    scheduled_label: scheduledLabel(windows),
    scheduled_label_lines: scheduledLabelLines(windows),
    per_shift: perShift,
  };
}
