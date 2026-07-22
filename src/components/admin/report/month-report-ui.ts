import {
  attendanceForTotals,
  computeValidPunchDay,
  computeWorkHoursWithBreaks,
  countedPunches,
  dayShopStatusFromRows,
  formatDuration,
  sortByEventTime,
  type AttendanceRecord,
} from "@/lib/attendance";
import { isAttendancePenaltyExemptStatus } from "@/lib/shifts/schedule-off-day";
import { matchesEventDate, recordEventTime } from "@/lib/attendance-db";
import type { DayIssueStats, IssueBadgeType } from "@/lib/attendance-report";
import { recordEventDate } from "@/lib/attendance-db";
import { parseRiskFlagsJson } from "@/lib/punch-risk";
import { isManualApprovalMethod } from "@/lib/verification-method";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

export type MonthStaffStatus = "in_shop" | "out" | "absent" | "review_needed";

export type MonthShiftPerformanceUi = {
  scheduled_days: number;
  present_days: number;
  late_count: number;
  absent_count: number;
  early_leave_count: number;
  actual_hours_ms: number;
  scheduled_hours_ms: number;
  actual_hours_label: string;
  scheduled_hours_label: string;
  reliability_percent: number;
  daily?: Array<{
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
    status: string;
    per_shift?: Array<{
      scheduled_start: string;
      scheduled_end: string;
      actual_clock_in: string | null;
      actual_clock_out: string | null;
      late_minutes: number;
      early_leave_minutes: number;
      status: string;
    }>;
  }>;
};

export type MonthRowUi = {
  staff_id: string;
  staff_name: string;
  staff_code: string;
  staff_type: string;
  position_name?: string | null;
  staff_status?: string;
  present_days: number;
  total_hours_ms: number;
  total_hours_label: string;
  missing_clock_out_days: number;
  weak_gps_count: number;
  rejected_gps_count: number;
  review_required_count: number;
  summary_score: number;
  issues: DayIssueStats;
  history: AttendanceRecord[];
  shift_performance?: MonthShiftPerformanceUi | null;
};

export type MonthDashboardSummary = {
  presentStaff: number;
  totalHoursLabel: string;
  inShopCount: number;
  missingPunchCount: number;
  reviewRequiredCount: number;
  lateIssuesCount: number;
  gpsIssuesCount: number;
  attendanceRatePercent: number;
};

export type RowAttention = "normal" | "attention" | "critical";

const GPS_ISSUE_BADGES: IssueBadgeType[] = [
  "weak_indoor",
  "expanded_radius",
  "rejected_gps",
  "review_required",
];

export function monthIncludesToday(monthYmd: string): boolean {
  const today = malaysiaDateYmd(new Date());
  return today.startsWith(`${monthYmd}-`);
}

export function staffMonthStatus(
  history: AttendanceRecord[],
  monthYmd: string,
  todayAttendanceStatus?: string | null,
): MonthStaffStatus {
  const today = malaysiaDateYmd(new Date());
  const todayRows = history.filter((r) => matchesEventDate(r, today));

  if (monthIncludesToday(monthYmd)) {
    if (isAttendancePenaltyExemptStatus(todayAttendanceStatus ?? undefined)) {
      return "out";
    }
    const todayCounted = attendanceForTotals(todayRows);
    if (todayCounted.length === 0) {
      return "absent";
    }
    const todayStatus = dayShopStatusFromRows(todayRows, today);
    if (todayStatus === "in_shop") return "in_shop";
    if (todayStatus === "missing_clock_out") return "review_needed";
    return "out";
  }

  const sorted = sortByEventTime(attendanceForTotals(history));
  if (sorted.length === 0) return "absent";
  const last = sorted[sorted.length - 1]!;
  if (last.action_type === "clock_in") return "review_needed";
  return "out";
}

export function rowAttention(row: MonthRowUi, monthYmd: string): RowAttention {
  if (
    row.missing_clock_out_days > 0 ||
    row.issues.badges.includes("missing_punch") ||
    row.issues.badges.includes("missing_clock_in") ||
    row.rejected_gps_count > 0
  ) {
    return "critical";
  }
  if (
    row.review_required_count > 0 ||
    row.weak_gps_count > 0 ||
    row.issues.missing_clock_out ||
    staffMonthStatus(row.history, monthYmd) === "review_needed"
  ) {
    return "attention";
  }
  return "normal";
}

export function buildMonthDashboardSummary(
  monthYmd: string,
  rows: MonthRowUi[],
  summaryTotalHoursLabel: string,
): MonthDashboardSummary {
  let inShopCount = 0;
  let missingPunchCount = 0;
  let reviewRequiredCount = 0;
  let lateIssuesCount = 0;
  let gpsIssuesCount = 0;
  let withPunch = 0;

  for (const row of rows) {
    if (row.present_days > 0) withPunch += 1;
    if (staffMonthStatus(row.history, monthYmd) === "in_shop") inShopCount += 1;
    if (
      row.missing_clock_out_days > 0 ||
      row.issues.badges.includes("missing_punch") ||
      row.issues.badges.includes("missing_clock_in") ||
      row.issues.badges.includes("missing_clock_out")
    ) {
      missingPunchCount += 1;
    }
    if (row.review_required_count > 0 || row.issues.badges.includes("review_required")) {
      reviewRequiredCount += 1;
    }
    if (row.missing_clock_out_days > 0) lateIssuesCount += row.missing_clock_out_days;
    if (
      row.weak_gps_count > 0 ||
      row.rejected_gps_count > 0 ||
      row.review_required_count > 0 ||
      row.issues.badges.some((b) => GPS_ISSUE_BADGES.includes(b))
    ) {
      gpsIssuesCount += 1;
    }
  }

  const attendanceRatePercent =
    rows.length > 0 ? Math.round((withPunch / rows.length) * 100) : 0;

  return {
    presentStaff: rows.length,
    totalHoursLabel: summaryTotalHoursLabel,
    inShopCount,
    missingPunchCount,
    reviewRequiredCount,
    lateIssuesCount,
    gpsIssuesCount,
    attendanceRatePercent,
  };
}

export function averageHoursPerDayLabel(row: MonthRowUi): string {
  if (row.present_days <= 0) return "—";
  return formatDuration(Math.floor(row.total_hours_ms / row.present_days));
}

export type ManagerIssueChip = {
  key: string;
  label: string;
  tone: "amber" | "violet" | "teal" | "orange" | "red" | "rose" | "sky";
};

export function managerIssueChips(issues: DayIssueStats, row: MonthRowUi): ManagerIssueChip[] {
  const chips: ManagerIssueChip[] = [];
  const seen = new Set<string>();

  const add = (key: string, label: string, tone: ManagerIssueChip["tone"]) => {
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ key, label, tone });
  };

  if (issues.badges.includes("missing_clock_out") || row.missing_clock_out_days > 0) {
    add("missing_out", "Missing Clock Out", "amber");
  }
  if (issues.badges.includes("missing_clock_in")) add("missing_in", "Missing Clock In", "amber");
  if (issues.badges.includes("photo_proof") || issues.photo_proof_count > 0) {
    add("photo_proof", "Photo Proof", "violet");
  }
  if (issues.manual_approved_count > 0 || issues.badges.includes("manual_approved")) {
    add("manual", "Manual Approved", "teal");
  }
  if (
    row.weak_gps_count > 0 ||
    row.rejected_gps_count > 0 ||
    row.review_required_count > 0 ||
    issues.badges.some((b) => GPS_ISSUE_BADGES.includes(b))
  ) {
    add("gps", "GPS Issues", "orange");
  }
  if (issues.badges.includes("duplicate_punch")) add("dup", "Duplicate Punch", "rose");
  if (issues.badges.includes("suspicious_punch_sequence")) {
    add("suspicious", "Suspicious Sequence", "orange");
  }
  if (issues.badges.includes("duplicate_prevented")) {
    add("dup_prev", "Duplicate Prevented", "sky");
  }
  if (issues.badges.includes("new_device")) {
    add("new_device", "New Device Detected", "sky");
  }
  if (issues.badges.includes("device_mismatch")) {
    add("device_mismatch", "Device Mismatch", "red");
  }
  if (issues.badges.includes("buddy_punch")) {
    add("buddy_punch", "Buddy Punch Risk", "red");
  }

  return chips;
}

export type { AttendanceReliability, ReliabilityTier } from "@/lib/attendance-reliability";
export { attendanceReliability } from "@/lib/attendance-reliability";

export type MonthDaySession = {
  date: string;
  sessions: { in: string; out: string; durationLabel: string }[];
  firstIn: string | null;
  lastOut: string | null;
  hoursLabel: string;
};

export function monthWorkingSessionsByDay(
  history: AttendanceRecord[],
  monthYmd: string,
  daysInMonth: number,
): MonthDaySession[] {
  const days: MonthDaySession[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, "0");
    const ymd = `${monthYmd}-${dd}`;
    const dayRows = history.filter((p) => matchesEventDate(p, ymd));
    if (attendanceForTotals(dayRows).length === 0) continue;
    const dayPunches = sortByEventTime(countedPunches(dayRows));
    const { sessions, firstValidIn, lastValidOut } = computeValidPunchDay(dayRows);
    const workHours = computeWorkHoursWithBreaks(dayPunches);
    days.push({
      date: ymd,
      sessions: sessions.map((s) => ({
        in: recordEventTime(s.in),
        out: recordEventTime(s.out),
        durationLabel: formatDuration(s.durationMs),
      })),
      firstIn: firstValidIn ? recordEventTime(firstValidIn) : null,
      lastOut: lastValidOut ? recordEventTime(lastValidOut) : null,
      hoursLabel: formatDuration(workHours.workedMs),
    });
  }
  return days;
}

export function monthFirstInLastOut(history: AttendanceRecord[]): {
  firstIn: string | null;
  lastOut: string | null;
} {
  const sorted = sortByEventTime(attendanceForTotals(history));
  const ins = sorted.filter((r) => r.action_type === "clock_in");
  const outs = sorted.filter((r) => r.action_type === "clock_out");
  return {
    firstIn: ins[0] ? recordEventTime(ins[0]) : null,
    lastOut: outs.length ? recordEventTime(outs[outs.length - 1]!) : null,
  };
}

export function monthManualEdits(history: AttendanceRecord[]): AttendanceRecord[] {
  return sortByEventTime(history).filter(
    (r) =>
      isManualApprovalMethod(r.verification_method) ||
      Boolean(r.audit_notes?.trim()),
  );
}

export function monthPhotoProofRows(history: AttendanceRecord[]): AttendanceRecord[] {
  return sortByEventTime(history).filter((r) => r.photo_proof_used);
}

export type DeviceRiskEvent = {
  date: string;
  staff_name: string;
  staff_id: string;
  device_name: string;
  fingerprint: string;
  shop_name: string;
  type: string;
};

export function collectNewDeviceEvents(row: MonthRowUi): DeviceRiskEvent[] {
  const events: DeviceRiskEvent[] = [];
  for (const r of row.history) {
    const flags = parseRiskFlagsJson(r.risk_flags);
    if (!flags.includes("new_device") && r.device_trust_status !== "new_device") continue;
    events.push({
      date: recordEventDate(r),
      staff_name: row.staff_name,
      staff_id: row.staff_id,
      device_name: r.punch_device_name?.trim() || r.punch_platform?.trim() || "Unknown device",
      fingerprint: (r.device_fingerprint ?? r.punch_device_id ?? "—").slice(0, 64),
      shop_name: r.shop_name?.trim() || "—",
      type: "New Device Detected",
    });
  }
  return events;
}

export function collectDeviceMismatchEvents(row: MonthRowUi): DeviceRiskEvent[] {
  const events: DeviceRiskEvent[] = [];
  for (const r of row.history) {
    const flags = parseRiskFlagsJson(r.risk_flags);
    if (!flags.includes("device_mismatch")) continue;
    events.push({
      date: recordEventDate(r),
      staff_name: row.staff_name,
      staff_id: row.staff_id,
      device_name: r.punch_device_name?.trim() || r.punch_platform?.trim() || "Unknown device",
      fingerprint: (r.device_fingerprint ?? r.punch_device_id ?? "—").slice(0, 64),
      shop_name: r.shop_name?.trim() || "—",
      type: "Device Mismatch",
    });
  }
  return events;
}
