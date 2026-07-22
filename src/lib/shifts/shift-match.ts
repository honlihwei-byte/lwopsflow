import {
  attendanceForTotals,
  computeValidPunchDay,
  computeWorkHoursWithBreaks,
  countedPunches,
  firstClockIn,
  isRestPunch,
  lastClockOut,
  sortByEventTime,
  type AttendanceRecord,
} from "@/lib/attendance";
import { matchesEventDate, recordEventInstant, recordEventTime } from "@/lib/attendance-db";
import { malaysiaDateYmd, parseMalaysiaEventInstant } from "@/lib/malaysia-time";

export type ShiftMatchStatus =
  | "on_time"
  | "late"
  | "early_leave"
  | "absent"
  | "missing_clock_in"
  | "missing_clock_out"
  | "open_shift"
  | "in_shift"
  | "waiting_for_next_shift"
  | "completed"
  | "upcoming"
  | "overtime"
  | "unscheduled_punch"
  | "off_day"
  | "not_scheduled"
  | "mc"
  | "al"
  | "ul"
  | "el"
  | "partial_attendance";

export type ShiftMatchResult = {
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_clock_in: string | null;
  actual_clock_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  missing_clock_in: boolean;
  missing_clock_out: boolean;
  absent: boolean;
  scheduled_hours_ms: number;
  worked_hours_ms: number;
  break_ms: number;
  status: ShiftMatchStatus;
};

/**
 * Grace window (minutes) before a late clock-in is counted. Clocking in at or
 * before scheduled_start + grace yields late_minutes = 0 / status on_time.
 */
export const LATE_GRACE_MINUTES = 5;

function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : null;
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map((x) => Number(x));
  const [eh, em] = end.split(":").map((x) => Number(x));
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 24 * 60;
  return Math.max(0, e - s);
}

export function matchAttendanceToScheduledShift(params: {
  ymd: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  breakMinutes?: number | null;
  isOffDay?: boolean;
  /** When set, day is rest/leave — never absent (RD → off_day, MC/AL/UL/EL). */
  scheduleLeaveStatus?: ShiftMatchStatus | null;
  history: AttendanceRecord[];
}): ShiftMatchResult {
  const scheduledStart = hhmm(params.scheduledStart);
  const scheduledEnd = hhmm(params.scheduledEnd);
  const breakMin = Math.max(0, Math.round(Number(params.breakMinutes ?? 0) || 0));
  const leaveStatus = params.scheduleLeaveStatus ?? (params.isOffDay === true ? "off_day" : null);

  const dayPunches = sortByEventTime(
    countedPunches(params.history.filter((r) => matchesEventDate(r, params.ymd))),
  );
  const dayRows = dayPunches.filter((r) => !isRestPunch(r));
  const valid = computeValidPunchDay(dayRows);
  const workHours = computeWorkHoursWithBreaks(dayPunches);
  const workedMs = workHours.workedMs;
  const breakMs = workHours.breakMs;

  const fi = firstClockIn(dayRows);
  const lo = lastClockOut(dayRows);
  const hasOpenIn = valid.openIn != null;

  const actualIn = fi ? recordEventTime(fi) : null;
  const actualOut = hasOpenIn ? null : lo ? recordEventTime(lo) : null;
  const inMs = fi ? recordEventInstant(fi) : null;
  const outMs = hasOpenIn ? null : lo ? recordEventInstant(lo) : null;

  const hasPunches = dayRows.length > 0;
  const hasSchedule = Boolean(scheduledStart && scheduledEnd);

  if (leaveStatus) {
    return {
      date: params.ymd,
      scheduled_start: null,
      scheduled_end: null,
      actual_clock_in: hasPunches ? actualIn : null,
      actual_clock_out: hasPunches ? actualOut : null,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missing_clock_in: false,
      missing_clock_out: false,
      absent: false,
      scheduled_hours_ms: 0,
      worked_hours_ms: hasPunches ? workedMs : 0,
      break_ms: hasPunches ? breakMs : 0,
      status: leaveStatus,
    };
  }

  if (!hasSchedule && hasPunches) {
    return {
      date: params.ymd,
      scheduled_start: null,
      scheduled_end: null,
      actual_clock_in: actualIn,
      actual_clock_out: actualOut,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missing_clock_in: fi == null,
      missing_clock_out: fi != null && (hasOpenIn || lo == null),
      absent: false,
      scheduled_hours_ms: 0,
      worked_hours_ms: workedMs,
      break_ms: breakMs,
      status: "unscheduled_punch",
    };
  }

  if (!hasSchedule) {
    return {
      date: params.ymd,
      scheduled_start: null,
      scheduled_end: null,
      actual_clock_in: hasPunches ? actualIn : null,
      actual_clock_out: hasPunches ? actualOut : null,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missing_clock_in: false,
      missing_clock_out: false,
      absent: false,
      scheduled_hours_ms: 0,
      worked_hours_ms: hasPunches ? workedMs : 0,
      break_ms: hasPunches ? breakMs : 0,
      status: hasPunches ? "unscheduled_punch" : "not_scheduled",
    };
  }

  const schedMinutes = Math.max(0, minutesBetween(scheduledStart!, scheduledEnd!) - breakMin);
  const scheduledMs = schedMinutes * 60_000;
  const todayYmd = malaysiaDateYmd(new Date());
  const isFutureDay = params.ymd > todayYmd;

  if (!hasPunches) {
    return {
      date: params.ymd,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      actual_clock_in: null,
      actual_clock_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      overtime_minutes: 0,
      missing_clock_in: false,
      missing_clock_out: false,
      absent: !isFutureDay,
      scheduled_hours_ms: isFutureDay ? 0 : scheduledMs,
      worked_hours_ms: 0,
      break_ms: 0,
      status: isFutureDay ? "upcoming" : "absent",
    };
  }

  const schedStartMs =
    parseMalaysiaEventInstant(params.ymd, `${scheduledStart}:00`) ??
    new Date(`${params.ymd}T${scheduledStart}:00+08:00`).getTime();
  let schedEndMs =
    parseMalaysiaEventInstant(params.ymd, `${scheduledEnd}:00`) ??
    new Date(`${params.ymd}T${scheduledEnd}:00+08:00`).getTime();
  if (schedEndMs <= schedStartMs) schedEndMs += 24 * 60 * 60 * 1000;

  // Minute-level comparison: seconds within the same minute never count as late
  // (e.g. shift 11:00, clock-in 11:00:44 → 0). A grace period absorbs minor
  // lateness so late_minutes reflects only time late BEYOND the grace window.
  const inMin = inMs != null ? Math.floor(inMs / 60000) : null;
  const schedStartMin = Math.floor(schedStartMs / 60000);
  const lateMinutes =
    inMin != null ? Math.max(0, inMin - schedStartMin - LATE_GRACE_MINUTES) : 0;
  const earlyLeaveMinutes =
    outMs != null
      ? outMs >= schedEndMs
        ? 0
        : Math.max(0, Math.round((schedEndMs - outMs) / 60000))
      : 0;
  const overtimeMinutes =
    outMs != null
      ? outMs <= schedEndMs
        ? 0
        : Math.max(0, Math.round((outMs - schedEndMs) / 60000))
      : 0;

  const missingClockIn = fi == null;
  const isToday = params.ymd === todayYmd;
  const graceMinutes = 30;

  // Only confirm missing clock out after shift end + grace, for today's open shifts.
  const missingClockOutRaw = fi != null && (hasOpenIn || lo == null);
  const overdueMissingOut =
    missingClockOutRaw && isToday && scheduledEnd && schedEndMs
      ? Date.now() > schedEndMs + graceMinutes * 60_000
      : missingClockOutRaw && !isToday; // past days: missing out is confirmed

  const openShift =
    missingClockOutRaw && isToday && !overdueMissingOut;

  const missingClockOut = missingClockOutRaw && overdueMissingOut;

  let status: ShiftMatchStatus = "on_time";
  if (missingClockIn && missingClockOut) status = "missing_clock_in";
  else if (missingClockIn) status = "missing_clock_in";
  else if (openShift) status = "open_shift";
  else if (missingClockOut) status = "missing_clock_out";
  else if (lateMinutes > 0) status = "late";
  else if (earlyLeaveMinutes > 5) status = "early_leave";
  else if (overtimeMinutes > 10) status = "overtime";

  return {
    date: params.ymd,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    actual_clock_in: actualIn,
    actual_clock_out: actualOut,
    late_minutes: lateMinutes,
    early_leave_minutes: missingClockOut ? 0 : earlyLeaveMinutes,
    overtime_minutes: missingClockOut ? 0 : overtimeMinutes,
    missing_clock_in: missingClockIn,
    missing_clock_out: missingClockOut,
    absent: false,
    scheduled_hours_ms: scheduledMs,
    worked_hours_ms: workedMs,
    break_ms: breakMs,
    status,
  };
}

