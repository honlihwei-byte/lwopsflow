import type { DayShiftComparison } from "@/lib/shift-attendance-report";
import type { PayrollMode } from "@/lib/payroll-mode";
import { isAttendancePenaltyExemptStatus } from "@/lib/shifts/schedule-off-day";

const EARLY_ARRIVAL_THRESHOLD_MIN = 5;
const LATE_ARRIVAL_THRESHOLD_MIN = 5;
const LATE_CLOCK_OUT_THRESHOLD_MIN = 10;

export type AttendanceKpiTotals = {
  working_days: number;
  early_arrival_count: number;
  late_arrival_count: number;
  late_clock_out_count: number;
  absent_days: number;
  perfect_attendance_days: number;
  actual_hours_ms: number;
  scheduled_hours_ms: number;
  break_hours_ms: number;
  payroll_hours_ms: number;
};

function earlyArrivalMinutes(cmp: DayShiftComparison): number {
  if (!cmp.scheduled_start || !cmp.actual_clock_in) return 0;
  const sched = parseHhmm(cmp.scheduled_start);
  const actual = parseHhmm(cmp.actual_clock_in);
  if (sched == null || actual == null) return 0;
  let diff = sched - actual;
  if (diff < 0) diff += 24 * 60;
  return diff > EARLY_ARRIVAL_THRESHOLD_MIN ? diff : 0;
}

function parseHhmm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** KPI counts only — use shift_performance totals for hour labels when daily rows omit ms. */
export function kpiCountsFromDaily(daily: DayShiftComparison[]): Omit<
  AttendanceKpiTotals,
  "actual_hours_ms" | "scheduled_hours_ms" | "break_hours_ms" | "payroll_hours_ms"
> {
  const full = kpiFromDaily(daily, "scheduled_hours");
  return {
    working_days: full.working_days,
    early_arrival_count: full.early_arrival_count,
    late_arrival_count: full.late_arrival_count,
    late_clock_out_count: full.late_clock_out_count,
    absent_days: full.absent_days,
    perfect_attendance_days: full.perfect_attendance_days,
  };
}

export function kpiFromDaily(
  daily: DayShiftComparison[],
  payrollMode: PayrollMode,
): AttendanceKpiTotals {
  let working_days = 0;
  let early_arrival_count = 0;
  let late_arrival_count = 0;
  let late_clock_out_count = 0;
  let absent_days = 0;
  let perfect_attendance_days = 0;
  let actual_hours_ms = 0;
  let scheduled_hours_ms = 0;
  let break_hours_ms = 0;

  for (const cmp of daily) {
    actual_hours_ms += cmp.actual_hours_ms;
    scheduled_hours_ms += cmp.scheduled_hours_ms;
    break_hours_ms += cmp.break_ms;

    const hasSchedule = Boolean(cmp.scheduled_start);
    if (cmp.actual_hours_ms > 0) working_days += 1;

    const penaltyExempt = isAttendancePenaltyExemptStatus(cmp.status);
    if (!penaltyExempt) {
      if ((cmp.missed_shifts ?? 0) > 0) {
        absent_days += cmp.missed_shifts!;
      } else if (cmp.status === "absent" && hasSchedule) {
        absent_days += 1;
      }
    }

    const earlyMin = earlyArrivalMinutes(cmp);
    if (earlyMin > 0) early_arrival_count += 1;

    if (
      !penaltyExempt &&
      (cmp.status === "late" || cmp.late_minutes > LATE_ARRIVAL_THRESHOLD_MIN)
    ) {
      late_arrival_count += 1;
    }

    if (!penaltyExempt && cmp.status === "early_leave") {
      late_clock_out_count += 1;
    }

    const perfect =
      hasSchedule &&
      !penaltyExempt &&
      cmp.status === "on_time" &&
      cmp.actual_hours_ms > 0 &&
      earlyMin === 0 &&
      cmp.late_minutes <= LATE_ARRIVAL_THRESHOLD_MIN &&
      cmp.early_leave_minutes <= LATE_CLOCK_OUT_THRESHOLD_MIN;
    if (perfect) perfect_attendance_days += 1;
  }

  const payroll_hours_ms =
    payrollMode === "actual_hours" ? actual_hours_ms : scheduled_hours_ms;

  return {
    working_days,
    early_arrival_count,
    late_arrival_count,
    late_clock_out_count,
    absent_days,
    perfect_attendance_days,
    actual_hours_ms,
    scheduled_hours_ms,
    break_hours_ms,
    payroll_hours_ms,
  };
}
