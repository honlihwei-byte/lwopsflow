import {
  attendanceForTotals,
  computeValidPunchDay,
  computeWorkHoursWithBreaks,
  countedPunches,
  firstClockIn,
  lastClockOut,
  sortByEventTime,
  type AttendanceRecord,
} from "@/lib/attendance";
import { matchesEventDate, recordEventInstant, recordEventTime } from "@/lib/attendance-db";
import { malaysiaDateYmd, parseMalaysiaEventInstant } from "@/lib/malaysia-time";
import { addDaysYmd } from "@/lib/attendance";
import {
  formatMinutesAsTime,
  parseTimeToMinutes,
  scheduledMsForDay,
  scheduledSlotsForDate,
  type StaffScheduleProfile,
} from "@/lib/staff-schedule";
import {
  attendanceStatusForScheduleRow,
  isAttendancePenaltyExemptStatus,
  isFutureAttendanceDay,
  isStaffScheduleNonWorkingDay,
  isStaffScheduleWorkingShift,
} from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { LATE_GRACE_MINUTES } from "@/lib/shifts/shift-match";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import type { ShopSchedulingFields } from "@/lib/shop-scheduling";
import { matchAttendanceToScheduledShift } from "@/lib/shifts/shift-match";
import { matchMultiShiftDay, type PerShiftDayResult } from "@/lib/shifts/multi-shift-match";

export type ShiftAttendanceStatus =
  | "on_time"
  | "late"
  | "early_leave"
  | "absent"
  | "missing_clock_out"
  | "open_shift"
  | "in_shift"
  | "waiting_for_next_shift"
  | "completed"
  | "upcoming"
  | "unscheduled_punch"
  | "off_day"
  | "not_scheduled"
  | "mc"
  | "al"
  | "ul"
  | "el"
  | "partial_attendance"
  | "missing_clock_in";

export type DayShiftComparison = {
  date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_label?: string | null;
  shifts_today?: number;
  attended_shifts?: number;
  missed_shifts?: number;
  actual_clock_in: string | null;
  actual_clock_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes?: number;
  early_arrival_minutes?: number;
  scheduled_hours_ms: number;
  actual_hours_ms: number;
  break_ms: number;
  status: ShiftAttendanceStatus;
  per_shift?: PerShiftDayResult[];
};

export type MonthShiftPerformance = {
  scheduled_days: number;
  present_days: number;
  late_count: number;
  absent_count: number;
  early_leave_count: number;
  actual_hours_ms: number;
  scheduled_hours_ms: number;
  break_hours_ms: number;
  reliability_percent: number;
  daily: DayShiftComparison[];
};

function mergeSlotRange(slots: ReturnType<typeof scheduledSlotsForDate>): {
  start: string;
  end: string;
} | null {
  if (slots.length === 0) return null;
  let startMin = parseTimeToMinutes(slots[0]!.start_time);
  let endMin = parseTimeToMinutes(slots[0]!.end_time);
  for (const s of slots.slice(1)) {
    startMin = Math.min(startMin, parseTimeToMinutes(s.start_time));
    let e = parseTimeToMinutes(s.end_time);
    const st = parseTimeToMinutes(s.start_time);
    if (e <= st) e += 24 * 60;
    endMin = Math.max(endMin, e);
  }
  return { start: formatMinutesAsTime(startMin), end: formatMinutesAsTime(endMin) };
}

function legacySlotsToSchedules(ymd: string, slots: ReturnType<typeof scheduledSlotsForDate>): StaffScheduleRow[] {
  return slots.map((slot, i) =>
    ({
      id: `legacy-${ymd}-${i}`,
      staff_id: "",
      shop_id: "",
      company_id: "",
      shift_date: ymd,
      schedule_type: "SHIFT",
      start_time: slot.start_time,
      end_time: slot.end_time,
      break_minutes: 0,
      sequence_no: i + 1,
      status: "active",
      repeat_type: "one_day",
      template_id: null,
      is_off_day: false,
      created_by: null,
      created_at: "",
      updated_at: "",
    }) as unknown as StaffScheduleRow,
  );
}

function computeViolationReliability(params: {
  scheduledDays: number;
  absentCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  missingClockOutCount: number;
  missingClockInCount: number;
}): number {
  if (params.scheduledDays === 0) return 100;
  let score = 100;
  score -= params.absentCount * 5;
  score -= params.lateCount * 2;
  score -= params.earlyLeaveCount * 3;
  score -= params.missingClockOutCount * 8;
  score -= params.missingClockInCount * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function compareDayShift(
  profile: StaffScheduleProfile,
  ymd: string,
  history: AttendanceRecord[],
): DayShiftComparison {
  const slots = scheduledSlotsForDate(profile, ymd);
  if (slots.length > 1) {
    const matched = matchMultiShiftDay({
      ymd,
      schedules: legacySlotsToSchedules(ymd, slots),
      history,
    });
    return mapMatchedToDayComparison(ymd, matched);
  }
  const range = mergeSlotRange(slots);
  const scheduledMs = scheduledMsForDay(profile, ymd);
  const dayPunches = sortByEventTime(
    countedPunches(history.filter((r) => matchesEventDate(r, ymd))),
  );
  const dayRows = attendanceForTotals(dayPunches);
  const valid = computeValidPunchDay(dayRows);
  const workHours = computeWorkHoursWithBreaks(dayPunches);
  const actualMs = workHours.workedMs;

  const fi = firstClockIn(dayRows);
  const lo = lastClockOut(dayRows);
  const hasOpenIn = valid.openIn != null;
  const actualIn = fi ? recordEventTime(fi) : null;
  const actualOut = hasOpenIn ? null : lo ? recordEventTime(lo) : null;
  const actualInMs = fi ? recordEventInstant(fi) : null;
  const actualOutMs = hasOpenIn ? null : lo ? recordEventInstant(lo) : null;

  if (!range && dayRows.length > 0) {
    return {
      date: ymd,
      scheduled_start: null,
      scheduled_end: null,
      actual_clock_in: actualIn,
      actual_clock_out: actualOut,
      late_minutes: 0,
      early_leave_minutes: 0,
      scheduled_hours_ms: 0,
      actual_hours_ms: actualMs,
      break_ms: workHours.breakMs,
      status: "unscheduled_punch",
    };
  }

  if (!range) {
    const hasPunch = dayRows.length > 0;
    return {
      date: ymd,
      scheduled_start: null,
      scheduled_end: null,
      actual_clock_in: hasPunch ? actualIn : null,
      actual_clock_out: hasPunch ? actualOut : null,
      late_minutes: 0,
      early_leave_minutes: 0,
      scheduled_hours_ms: 0,
      actual_hours_ms: hasPunch ? actualMs : 0,
      break_ms: hasPunch ? workHours.breakMs : 0,
      status: hasPunch ? "unscheduled_punch" : "not_scheduled",
    };
  }

  const isFutureDay = isFutureAttendanceDay(ymd);
  if (isFutureDay) {
    return {
      date: ymd,
      scheduled_start: range.start,
      scheduled_end: range.end,
      scheduled_label: `${range.start}–${range.end}`,
      shifts_today: 1,
      actual_clock_in: actualIn,
      actual_clock_out: actualOut,
      late_minutes: 0,
      early_leave_minutes: 0,
      scheduled_hours_ms: 0,
      actual_hours_ms: actualMs,
      break_ms: workHours.breakMs,
      status: "upcoming",
    };
  }

  if (dayRows.length === 0) {
    return {
      date: ymd,
      scheduled_start: range.start,
      scheduled_end: range.end,
      actual_clock_in: null,
      actual_clock_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      scheduled_hours_ms: scheduledMs,
      actual_hours_ms: 0,
      break_ms: 0,
      status: "absent",
    };
  }

  const schedStartMs =
    parseMalaysiaEventInstant(ymd, `${range.start}:00`) ?? new Date(`${ymd}T${range.start}:00+08:00`).getTime();
  let schedEndMs =
    parseMalaysiaEventInstant(ymd, `${range.end}:00`) ?? new Date(`${ymd}T${range.end}:00+08:00`).getTime();
  if (schedEndMs <= schedStartMs) schedEndMs += 24 * 60 * 60 * 1000;

  const inMs = actualInMs;
  const outMs = actualOutMs;

  // Minute-level comparison + grace window (mirrors matchAttendanceToScheduledShift).
  const lateMinutes =
    inMs != null
      ? Math.max(0, Math.floor(inMs / 60000) - Math.floor(schedStartMs / 60000) - LATE_GRACE_MINUTES)
      : 0;
  const earlyLeaveMinutes =
    outMs != null
      ? outMs >= schedEndMs
        ? 0
        : Math.max(0, Math.round((schedEndMs - outMs) / 60000))
      : 0;

  let status: ShiftAttendanceStatus = "on_time";
  if (hasOpenIn && fi) {
    const isToday = ymd === malaysiaDateYmd(new Date());
    if (!isToday) {
      status = "missing_clock_out";
    } else {
      const graceMinutes = 30;
      const overdue = Date.now() > schedEndMs + graceMinutes * 60_000;
      status = overdue ? "missing_clock_out" : "open_shift";
    }
  }
  else if (lateMinutes > 0) status = "late";
  else if (!hasOpenIn && earlyLeaveMinutes > 5) status = "early_leave";
  else if (earlyLeaveMinutes > 0) status = "on_time";

  return {
    date: ymd,
    scheduled_start: range.start,
    scheduled_end: range.end,
    actual_clock_in: actualIn,
    actual_clock_out: actualOut,
    late_minutes: lateMinutes,
    early_leave_minutes: hasOpenIn ? 0 : earlyLeaveMinutes,
    scheduled_hours_ms: scheduledMs,
    actual_hours_ms: actualMs,
    break_ms: workHours.breakMs,
    status,
  };
}

export function ymdsInRange(fromYmd: string, toYmd: string): string[] {
  const days: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    days.push(cur);
    cur = addDaysYmd(cur, 1);
    if (days.length > 400) break;
  }
  return days;
}

export type ShiftPerformanceOptions = {
  /** Staff has per-day rows in staff_schedules — do not infer fixed_daily absent days. */
  hasExplicitSchedules?: boolean;
  staffType?: string;
};

export function buildMonthShiftPerformance(
  profile: StaffScheduleProfile,
  monthYmd: string,
  daysInMonth: number,
  history: AttendanceRecord[],
  explicit?: Map<string, StaffScheduleRow[]>,
  shopScheduling?: ShopSchedulingFields | null,
  options?: ShiftPerformanceOptions,
): MonthShiftPerformance {
  const [y, mo] = monthYmd.split("-");
  const ymds: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    ymds.push(`${y}-${mo}-${String(d).padStart(2, "0")}`);
  }
  return buildRangeShiftPerformance(profile, ymds, history, explicit, shopScheduling, options);
}

function mapMatchedToDayComparison(ymd: string, matched: {
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_label?: string | null;
  shifts_today?: number;
  attended_shifts?: number;
  missed_shifts?: number;
  per_shift?: PerShiftDayResult[];
  actual_clock_in: string | null;
  actual_clock_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes?: number;
  scheduled_hours_ms: number;
  worked_hours_ms: number;
  break_ms: number;
  status: string;
}): DayShiftComparison {
  const status = matched.status as ShiftAttendanceStatus;
  const scheduledLabel =
    matched.scheduled_label ??
    (matched.scheduled_start && matched.scheduled_end
      ? `${matched.scheduled_start}–${matched.scheduled_end}`
      : null);
  return {
    date: ymd,
    scheduled_start: matched.scheduled_start,
    scheduled_end: matched.scheduled_end,
    scheduled_label: scheduledLabel,
    shifts_today: matched.shifts_today,
    attended_shifts: matched.attended_shifts,
    missed_shifts: matched.missed_shifts,
    actual_clock_in: matched.actual_clock_in,
    actual_clock_out: matched.actual_clock_out,
    late_minutes: matched.late_minutes,
    early_leave_minutes: matched.early_leave_minutes,
    overtime_minutes: matched.overtime_minutes,
    scheduled_hours_ms: matched.scheduled_hours_ms,
    actual_hours_ms: matched.worked_hours_ms,
    break_ms: matched.break_ms,
    status,
    per_shift: matched.per_shift,
  };
}

export function buildRangeShiftPerformance(
  profile: StaffScheduleProfile,
  ymds: string[],
  history: AttendanceRecord[],
  explicit?: Map<string, StaffScheduleRow[]>,
  shopScheduling?: ShopSchedulingFields | null,
  options?: ShiftPerformanceOptions,
): MonthShiftPerformance {
  const daily: DayShiftComparison[] = [];
  let scheduledDays = 0;
  let presentDays = 0;
  let lateCount = 0;
  let absentCount = 0;
  let earlyLeaveCount = 0;
  let missingClockOutCount = 0;
  let missingClockInCount = 0;
  let actualMs = 0;
  let scheduledMs = 0;
  let breakMs = 0;

  const useExplicitOnly =
    options?.hasExplicitSchedules === true ||
    options?.staffType === "part_time" ||
    profile.schedule_mode === "custom";

  function pickWorkingScheduleForDay(
    schedules: StaffScheduleRow[],
    dayRows: AttendanceRecord[],
  ): StaffScheduleRow | null {
    return pickPrimaryScheduleForDay({ schedules, dayRows, shopIdFilter: null });
  }

  for (const ymd of ymds) {
    const dayRows = history.filter((r) => matchesEventDate(r, ymd));
    const daySchedules = (explicit?.get(ymd) ?? []).filter((s) => s.status === "active");
    const nonWorkingRow = daySchedules.find((s) => isStaffScheduleNonWorkingDay(s)) ?? null;
    const workingRow = pickWorkingScheduleForDay(daySchedules, dayRows);
    const hasPunch = attendanceForTotals(dayRows).length > 0;

    let cmp: DayShiftComparison;

    if (nonWorkingRow) {
      const matched = matchAttendanceToScheduledShift({
        ymd,
        scheduledStart: null,
        scheduledEnd: null,
        breakMinutes: 0,
        scheduleLeaveStatus: attendanceStatusForScheduleRow(nonWorkingRow),
        history,
      });
      cmp = mapMatchedToDayComparison(ymd, matched);
    } else if (shopScheduling || daySchedules.some((s) => isStaffScheduleWorkingShift(s))) {
      const matched = matchStaffDayWithShopSchedule({
        ymd,
        shop: shopScheduling ?? null,
        explicitRow: workingRow,
        explicitRows: daySchedules,
        allSchedulesForDay: daySchedules,
        history,
      });
      cmp = mapMatchedToDayComparison(ymd, matched);
    } else if (useExplicitOnly) {
      const matched = matchAttendanceToScheduledShift({
        ymd,
        scheduledStart: null,
        scheduledEnd: null,
        breakMinutes: 0,
        history,
      });
      if (matched.status === "not_scheduled" && !hasPunch) {
        continue;
      }
      cmp = mapMatchedToDayComparison(ymd, matched);
    } else {
      cmp = compareDayShift(profile, ymd, history);
      if (cmp.status === "not_scheduled" && !hasPunch) {
        continue;
      }
    }

    // Hide unassigned NS-style days with no explicit row (not_scheduled + no punch).
    if (cmp.status === "not_scheduled" && !hasPunch && !nonWorkingRow) {
      continue;
    }

    daily.push(cmp);

    const isFutureDay = isFutureAttendanceDay(ymd);
    const isWorkingScheduledDay =
      ((cmp.shifts_today ?? 0) > 0 ||
        Boolean(cmp.scheduled_start && cmp.scheduled_end)) &&
      !["not_scheduled", "off_day", "mc", "al", "ul", "el", "upcoming"].includes(cmp.status);

    if (!isFutureDay) {
      if (shopScheduling?.work_time_mode === "fixed") {
        scheduledDays += 1;
        scheduledMs += cmp.scheduled_hours_ms;
      } else if (isWorkingScheduledDay) {
        scheduledDays += 1;
        scheduledMs += cmp.scheduled_hours_ms;
      } else if (!useExplicitOnly && profile.schedule_mode === "fixed_daily") {
        const legacySlots = scheduledSlotsForDate(profile, ymd);
        if (legacySlots.length > 0) {
          scheduledDays += 1;
          scheduledMs += cmp.scheduled_hours_ms;
        }
      }
    }

    if (!isFutureDay && isWorkingScheduledDay && cmp.actual_hours_ms > 0) presentDays += 1;
    actualMs += cmp.actual_hours_ms;
    breakMs += cmp.break_ms;

    if (!isFutureDay && isWorkingScheduledDay && !isAttendancePenaltyExemptStatus(cmp.status)) {
      if (cmp.per_shift?.length) {
        for (const ps of cmp.per_shift) {
          if (ps.status === "late" || ps.late_minutes > 0) lateCount += 1;
          if (ps.status === "early_leave" || ps.early_leave_minutes > 5) earlyLeaveCount += 1;
        }
      } else {
        if (cmp.status === "late") lateCount += 1;
        if (cmp.status === "early_leave") earlyLeaveCount += 1;
      }
      if (cmp.status === "missing_clock_out") missingClockOutCount += 1;
      if (cmp.status === "missing_clock_in") missingClockInCount += 1;
      if ((cmp.missed_shifts ?? 0) > 0) {
        absentCount += cmp.missed_shifts!;
      } else if (cmp.status === "absent") {
        absentCount += 1;
      }
    }
  }

  const reliability = computeViolationReliability({
    scheduledDays,
    absentCount,
    lateCount,
    earlyLeaveCount,
    missingClockOutCount,
    missingClockInCount,
  });

  return {
    scheduled_days: scheduledDays,
    present_days: presentDays,
    late_count: lateCount,
    absent_count: absentCount,
    early_leave_count: earlyLeaveCount,
    actual_hours_ms: actualMs,
    scheduled_hours_ms: scheduledMs,
    break_hours_ms: breakMs,
    reliability_percent: reliability,
    daily,
  };
}
