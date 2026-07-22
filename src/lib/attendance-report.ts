import { detectDayAttendanceIssues, detectPunchSequenceIssues } from "@/lib/attendance-issues";
import {
  attendanceForTotals,
  firstClockIn,
  formatDuration,
  gpsStatusLabel,
  lastClockOut,
  punchIssueForDay,
  sortByEventTime,
  totalWorkedMsForDay,
  type AttendanceRecord,
  type GpsStatusLabel,
} from "@/lib/attendance";
import { payrollHoursMs, type PayrollMode } from "@/lib/payroll-mode";
import { matchesEventDate, recordEventTime } from "@/lib/attendance-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { isDuplicatePreventedGuardRow } from "@/lib/smart-punch";
import { riskBadgesForRows, riskFlagsForRows } from "@/lib/attendance-risk-badges";
import { isManualApprovalMethod } from "@/lib/verification-method";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { matchAttendanceToScheduledShift } from "@/lib/shifts/shift-match";
import type { ShopSchedulingFields } from "@/lib/shop-scheduling";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type IssueBadgeType =
  | "missing_clock_out"
  | "missing_clock_in"
  | "missing_punch"
  | "open_shift"
  | "weak_indoor"
  | "expanded_radius"
  | "review_required"
  | "rejected_gps"
  | "photo_proof"
  | "manual_approved"
  | "duplicate_prevented"
  | "duplicate_punch"
  | "suspicious_punch_sequence"
  | "trusted_device"
  | "new_device"
  | "device_mismatch"
  | "buddy_punch"
  | "random_selfie"
  | "selfie_proof"
  | "high_risk";

export const ISSUE_BADGE_LABELS: Record<IssueBadgeType, string> = {
  missing_clock_out: "Missing clock out",
  missing_clock_in: "Missing clock in",
  missing_punch: "Missing Punch",
  open_shift: "Open Shift",
  weak_indoor: "Weak Indoor",
  expanded_radius: "Expanded Radius",
  review_required: "Review Required",
  rejected_gps: "Rejected GPS",
  photo_proof: "Photo Proof",
  manual_approved: "Manual Approved",
  duplicate_prevented: "Duplicate prevented",
  duplicate_punch: "Duplicate Punch",
  suspicious_punch_sequence: "Suspicious Punch Sequence",
  trusted_device: "Trusted Device",
  new_device: "New Device Detected",
  device_mismatch: "Device Mismatch",
  buddy_punch: "Potential Buddy Punch",
  random_selfie: "Random Selfie",
  selfie_proof: "Selfie Proof",
  high_risk: "High Risk",
};

export type DayIssueStats = {
  badges: IssueBadgeType[];
  issue_count: number;
  missing_clock_out: boolean;
  weak_indoor_count: number;
  expanded_radius_count: number;
  review_required_count: number;
  rejected_gps_count: number;
  photo_proof_count: number;
  manual_approved_count: number;
  duplicate_prevented_count: number;
};

export type DayCellDetail = {
  present: boolean;
  hours_ms: number;
  hours_label: string;
  break_ms: number;
  break_label: string;
  scheduled_hours_ms: number;
  scheduled_hours_label: string;
  paid_hours_ms: number;
  paid_hours_label: string;
  first_in: string | null;
  last_out: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  scheduled_label?: string | null;
  shifts_today?: number;
  attended_shifts?: number;
  missed_shifts?: number;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  attendance_status?: string;
  issues: DayIssueStats;
  punch_issue: string | null;
  history: AttendanceRecord[];
};

function dayHoursFields(
  dayRows: AttendanceRecord[],
  shift: { scheduled_hours_ms: number; worked_hours_ms: number; break_ms: number },
  payrollMode: PayrollMode = "scheduled_hours",
): Pick<
  DayCellDetail,
  | "hours_ms"
  | "hours_label"
  | "break_ms"
  | "break_label"
  | "scheduled_hours_ms"
  | "scheduled_hours_label"
  | "paid_hours_ms"
  | "paid_hours_label"
> {
  const hours_ms = shift.worked_hours_ms;
  const break_ms = shift.break_ms;
  const scheduled_hours_ms = shift.scheduled_hours_ms;
  const paid_hours_ms = payrollHoursMs(payrollMode, scheduled_hours_ms, hours_ms);
  return {
    hours_ms,
    hours_label: formatDuration(hours_ms),
    break_ms,
    break_label: formatDuration(break_ms),
    scheduled_hours_ms,
    scheduled_hours_label: formatDuration(scheduled_hours_ms),
    paid_hours_ms,
    paid_hours_label: formatDuration(paid_hours_ms),
  };
}

export type ReportSummary = {
  total_present_staff: number;
  total_hours_ms: number;
  total_hours_label: string;
  missing_clock_out_count: number;
  weak_indoor_count: number;
  rejected_gps_count: number;
  review_required_count: number;
  gps_issues_count: number;
};

export type GpsStatusFilter =
  | ""
  | "verified"
  | "weak_indoor"
  | "expanded_radius"
  | "review_required"
  | "rejected"
  | "location_na";

export type IssueTypeFilter =
  | ""
  | "missing_clock_out"
  | "missing_clock_in"
  | "missing_punch"
  | "manual_approved"
  | "duplicate_prevented"
  | "duplicate_punch"
  | "suspicious_punch_sequence"
  | "weak_indoor"
  | "review_required"
  | "rejected_gps"
  | "any"
  | "none";

export function parseGpsStatusFilter(v: string | null): GpsStatusFilter {
  const allowed: GpsStatusFilter[] = [
    "",
    "verified",
    "weak_indoor",
    "expanded_radius",
    "review_required",
    "rejected",
    "location_na",
  ];
  return allowed.includes(v as GpsStatusFilter) ? (v as GpsStatusFilter) : "";
}

export function parseIssueTypeFilter(v: string | null): IssueTypeFilter {
  const allowed: IssueTypeFilter[] = [
    "",
    "missing_clock_out",
    "missing_clock_in",
    "missing_punch",
    "manual_approved",
    "duplicate_prevented",
    "duplicate_punch",
    "suspicious_punch_sequence",
    "weak_indoor",
    "review_required",
    "rejected_gps",
    "any",
    "none",
  ];
  return allowed.includes(v as IssueTypeFilter) ? (v as IssueTypeFilter) : "";
}

function gpsStatusToFilterKey(status: GpsStatusLabel): GpsStatusFilter {
  switch (status) {
    case "GPS OK":
    case "Manual Approved":
      return "verified";
    case "Weak GPS":
      return "weak_indoor";
    case "Expanded Radius":
      return "expanded_radius";
    case "Indoor Review":
      return "review_required";
    case "Outside Radius":
    case "Rejected":
      return "rejected";
    case "Photo Proof":
      return "review_required";
    case "Location Not Available":
      return "location_na";
    default:
      return "location_na";
  }
}

export function analyzeDayIssues(rows: AttendanceRecord[]): DayIssueStats {
  const badges: IssueBadgeType[] = [];
  let weak_indoor_count = 0;
  let expanded_radius_count = 0;
  let review_required_count = 0;
  let rejected_gps_count = 0;
  let photo_proof_count = 0;
  let manual_approved_count = 0;
  let duplicate_prevented_count = 0;

  for (const r of rows) {
    if (isDuplicatePreventedGuardRow(r)) duplicate_prevented_count += 1;
    const status = gpsStatusLabel(r);
    if (status === "Weak GPS") weak_indoor_count += 1;
    if (status === "Expanded Radius") expanded_radius_count += 1;
    if (status === "Indoor Review") review_required_count += 1;
    if (status === "Outside Radius" || status === "Rejected") rejected_gps_count += 1;
    if (status === "Photo Proof") photo_proof_count += 1;
    if (isManualApprovalMethod(r.verification_method)) manual_approved_count += 1;
  }

  const dayIssues = detectDayAttendanceIssues(rows);
  const missing_clock_out = dayIssues.missing_clock_out;
  const missing_clock_in = dayIssues.missing_clock_in;
  // Missing punch: show the specific missing clock-in/out only (avoid duplicate/confusing labels).
  if (missing_clock_in) badges.push("missing_clock_in");
  else if (missing_clock_out) badges.push("missing_clock_out");
  // Do not treat indoor fallback / weak indoor confidence as an issue badge (noise).
  if (review_required_count > 0) badges.push("review_required");
  if (rejected_gps_count > 0) badges.push("rejected_gps");
  if (photo_proof_count > 0) badges.push("photo_proof");
  if (manual_approved_count > 0) badges.push("manual_approved");
  if (duplicate_prevented_count > 0) badges.push("duplicate_prevented");

  const punchSeq = detectPunchSequenceIssues(rows);
  if (punchSeq.duplicate_punch) badges.push("duplicate_punch");
  if (punchSeq.suspicious_punch_sequence) badges.push("suspicious_punch_sequence");

  // Risk flags → issue badges (never show trusted_device as an issue).
  for (const flag of riskFlagsForRows(rows)) {
    if (flag === "new_device") badges.push("new_device");
    if (flag === "device_mismatch") badges.push("device_mismatch");
    if (flag === "buddy_punch") badges.push("buddy_punch");
  }
  for (const rb of riskBadgesForRows(rows)) {
    if (rb === "trusted_device") continue;
    if (rb === "high_risk") badges.push("high_risk");
    if (rb === "random_selfie") badges.push("random_selfie");
    if (rb === "selfie_proof") badges.push("selfie_proof");
  }

  return {
    badges,
    issue_count: badges.length,
    missing_clock_out,
    weak_indoor_count,
    expanded_radius_count,
    review_required_count,
    rejected_gps_count,
    photo_proof_count,
    manual_approved_count,
    duplicate_prevented_count,
  };
}

export function analyzeDayIssuesWithShift(
  rows: AttendanceRecord[],
  shiftStatus: string | null | undefined,
): DayIssueStats {
  const base = analyzeDayIssues(rows);
  if (!shiftStatus) return base;

  // Open / in-shift / waiting / completed / leave / NS / future are not missing punch.
  if (
    shiftStatus === "open_shift" ||
    shiftStatus === "in_shift" ||
    shiftStatus === "waiting_for_next_shift" ||
    shiftStatus === "completed" ||
    shiftStatus === "upcoming" ||
    shiftStatus === "off_day" ||
    shiftStatus === "not_scheduled" ||
    shiftStatus === "mc" ||
    shiftStatus === "al" ||
    shiftStatus === "ul" ||
    shiftStatus === "el"
  ) {
    const badges = base.badges.filter((b) => b !== "missing_clock_out" && b !== "missing_punch");
    if (shiftStatus === "open_shift" && !badges.includes("open_shift")) badges.unshift("open_shift");
    return {
      ...base,
      badges,
      issue_count: badges.length,
      missing_clock_out: false,
    };
  }

  return base;
}

export function dayCellDetailWithShop(
  rows: AttendanceRecord[],
  dayYmd: string,
  shop: ShopSchedulingFields | null,
  explicitRow: StaffScheduleRow | null | undefined,
  options?: {
    explicitRows?: StaffScheduleRow[];
    shopIdFilter?: string | null;
    payrollMode?: PayrollMode;
  },
): DayCellDetail {
  const dayRows = rows.filter((p) => matchesEventDate(p, dayYmd));
  const present = attendanceForTotals(dayRows).length > 0;
  const fi = firstClockIn(dayRows);
  const lo = lastClockOut(dayRows);

  const isFutureDay = dayYmd > malaysiaDateYmd(new Date());

  const shift = matchStaffDayWithShopSchedule({
    ymd: dayYmd,
    shop,
    explicitRow,
    explicitRows: options?.explicitRows,
    allSchedulesForDay: options?.explicitRows,
    history: dayRows,
    shopIdFilter: options?.shopIdFilter ?? null,
  });
  const attendanceStatus = isFutureDay ? "upcoming" : shift.status;
  const issues = isFutureDay
    ? { badges: [] as IssueBadgeType[], issue_count: 0, missing_clock_out: false, weak_indoor_count: 0, expanded_radius_count: 0, review_required_count: 0, rejected_gps_count: 0, photo_proof_count: 0, manual_approved_count: 0, duplicate_prevented_count: 0 }
    : analyzeDayIssuesWithShift(dayRows, attendanceStatus);

  return {
    present,
    ...dayHoursFields(dayRows, shift, options?.payrollMode),
    first_in: fi ? recordEventTime(fi) : null,
    last_out: lo ? recordEventTime(lo) : null,
    scheduled_start: shift.scheduled_start,
    scheduled_end: shift.scheduled_end,
    scheduled_label:
      "scheduled_label" in shift && shift.scheduled_label
        ? shift.scheduled_label
        : shift.scheduled_start && shift.scheduled_end
          ? `${shift.scheduled_start}–${shift.scheduled_end}`
          : null,
    shifts_today: "shifts_today" in shift ? shift.shifts_today : undefined,
    attended_shifts: isFutureDay ? 0 : "attended_shifts" in shift ? shift.attended_shifts : undefined,
    missed_shifts: isFutureDay ? 0 : "missed_shifts" in shift ? shift.missed_shifts : undefined,
    late_minutes: isFutureDay ? 0 : shift.late_minutes,
    early_leave_minutes: isFutureDay ? 0 : shift.early_leave_minutes,
    overtime_minutes: isFutureDay ? 0 : shift.overtime_minutes,
    attendance_status: attendanceStatus,
    issues,
    punch_issue: isFutureDay ? null : punchIssueForDay(dayRows),
    history: sortByEventTime(dayRows),
  };
}

export function dayCellDetail(
  rows: AttendanceRecord[],
  dayYmd: string,
  scheduled?: { start: string; end: string; break_minutes?: number | null } | null,
  payrollMode: PayrollMode = "scheduled_hours",
): DayCellDetail {
  const dayRows = rows.filter((p) => matchesEventDate(p, dayYmd));
  const present = attendanceForTotals(dayRows).length > 0;
  const fi = firstClockIn(dayRows);
  const lo = lastClockOut(dayRows);
  const issues = analyzeDayIssues(dayRows);

  const shift =
    scheduled?.start && scheduled?.end
      ? matchAttendanceToScheduledShift({
          ymd: dayYmd,
          scheduledStart: scheduled.start,
          scheduledEnd: scheduled.end,
          breakMinutes: scheduled.break_minutes ?? 0,
          history: dayRows,
        })
      : matchAttendanceToScheduledShift({
          ymd: dayYmd,
          scheduledStart: null,
          scheduledEnd: null,
          breakMinutes: 0,
          history: dayRows,
        });

  return {
    present,
    ...dayHoursFields(dayRows, shift, payrollMode),
    first_in: fi ? recordEventTime(fi) : null,
    last_out: lo ? recordEventTime(lo) : null,
    scheduled_start: shift.scheduled_start,
    scheduled_end: shift.scheduled_end,
    late_minutes: shift.late_minutes,
    early_leave_minutes: shift.early_leave_minutes,
    overtime_minutes: shift.overtime_minutes,
    attendance_status: shift.status,
    issues,
    punch_issue: punchIssueForDay(dayRows),
    history: sortByEventTime(dayRows),
  };
}

export function monthStatsFromRows(rows: AttendanceRecord[], daysInMonth: number, monthYmdPrefix: string) {
  let missing_clock_out_days = 0;
  let weak_gps_count = 0;
  let review_required_count = 0;
  let rejected_gps_count = 0;
  let total_hours_ms = 0;
  const presentDates = new Set<string>();

  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, "0");
    const ymd = `${monthYmdPrefix}-${dd}`;
    const dayRows = rows.filter((p) => matchesEventDate(p, ymd));
    if (attendanceForTotals(dayRows).length === 0) continue;
    presentDates.add(ymd);
    total_hours_ms += totalWorkedMsForDay(dayRows);
    const issues = analyzeDayIssues(dayRows);
    if (issues.missing_clock_out) missing_clock_out_days += 1;
    weak_gps_count += issues.weak_indoor_count;
    review_required_count += issues.review_required_count;
    rejected_gps_count += issues.rejected_gps_count;
  }

  const present_days = presentDates.size;
  const summary_score = staffAttendanceScore({
    present_days,
    missing_clock_out_days,
    weak_gps_count,
    review_required_count,
    rejected_gps_count,
  });

  return {
    present_days,
    no_punch_days: Math.max(0, daysInMonth - present_days),
    total_hours_ms,
    total_hours_label: formatDuration(total_hours_ms),
    missing_clock_out_days,
    weak_gps_count,
    review_required_count,
    rejected_gps_count,
    summary_score,
  };
}

export function staffAttendanceScore(stats: {
  present_days: number;
  missing_clock_out_days: number;
  weak_gps_count: number;
  review_required_count: number;
  rejected_gps_count: number;
}): number {
  if (stats.present_days === 0) return 0;
  let score = 100;
  score -= stats.missing_clock_out_days * 8;
  score -= stats.weak_gps_count * 2;
  score -= stats.review_required_count * 3;
  score -= stats.rejected_gps_count * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs review";
}

export function historyMatchesGpsFilter(
  history: AttendanceRecord[],
  filter: GpsStatusFilter,
): boolean {
  if (!filter) return true;
  return history.some((h) => gpsStatusToFilterKey(gpsStatusLabel(h)) === filter);
}

export function rowMatchesIssueFilter(issues: DayIssueStats, filter: IssueTypeFilter): boolean {
  if (!filter) return true;
  if (filter === "any") return issues.issue_count > 0;
  if (filter === "none") return issues.issue_count === 0;
  return issues.badges.includes(filter);
}

export function aggregateIssuesFromHistories(histories: AttendanceRecord[][]): DayIssueStats {
  const merged: IssueBadgeType[] = [];
  let weak = 0;
  let expanded = 0;
  let review = 0;
  let rejected = 0;
  let photo = 0;
  let manual = 0;
  let duplicate = 0;
  let missing = false;

  for (const rows of histories) {
    const d = analyzeDayIssues(rows);
    missing = missing || d.missing_clock_out;
    weak += d.weak_indoor_count;
    expanded += d.expanded_radius_count;
    review += d.review_required_count;
    rejected += d.rejected_gps_count;
    photo += d.photo_proof_count;
    manual += d.manual_approved_count;
    duplicate += d.duplicate_prevented_count;
    for (const b of d.badges) {
      if (!merged.includes(b)) merged.push(b);
    }
  }

  return {
    badges: merged,
    issue_count: merged.length,
    missing_clock_out: missing,
    weak_indoor_count: weak,
    expanded_radius_count: expanded,
    review_required_count: review,
    rejected_gps_count: rejected,
    photo_proof_count: photo,
    manual_approved_count: manual,
    duplicate_prevented_count: duplicate,
  };
}

export function buildReportSummary(
  rows: { total_hours_ms: number; issues?: DayIssueStats; history?: AttendanceRecord[] }[],
): ReportSummary {
  let total_hours_ms = 0;
  let missing_clock_out_count = 0;
  let weak_indoor_count = 0;
  let rejected_gps_count = 0;
  let review_required_count = 0;

  for (const row of rows) {
    total_hours_ms += row.total_hours_ms ?? 0;
    const issues =
      row.issues ??
      (row.history ? analyzeDayIssues(row.history) : null);
    if (!issues) continue;
    if (issues.missing_clock_out) missing_clock_out_count += 1;
    weak_indoor_count += issues.weak_indoor_count;
    rejected_gps_count += issues.rejected_gps_count;

    // Review Required card counts staff-days that actually need manager attention.
    // Do NOT count Trusted Device.
    if (row.history) {
      const risk = riskBadgesForRows(row.history);
      const needsReview =
        issues.rejected_gps_count > 0 ||
        issues.review_required_count > 0 ||
        issues.photo_proof_count > 0 ||
        risk.includes("high_risk") ||
        risk.includes("new_device") ||
        risk.includes("buddy_punch");
      if (needsReview) review_required_count += 1;
    } else {
      // fallback: GPS review required only
      if (issues.review_required_count > 0 || issues.rejected_gps_count > 0) review_required_count += 1;
    }
  }

  return {
    total_present_staff: rows.length,
    total_hours_ms,
    total_hours_label: formatDuration(total_hours_ms),
    missing_clock_out_count,
    weak_indoor_count,
    rejected_gps_count,
    review_required_count,
    gps_issues_count: rejected_gps_count + review_required_count,
  };
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
