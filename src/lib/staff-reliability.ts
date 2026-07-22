import {
  analyzeDayIssuesWithShift,
  type DayIssueStats,
} from "@/lib/attendance-report";
import { addDaysYmd, sortByEventTime, staffHasPunchRows, type AttendanceRecord } from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { gpsIssueCountFromIssues, staffNeedsReviewToday } from "@/lib/operations-dashboard";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import type { StaffTaskReviewCounts } from "@/lib/retail-tasks/retail-tasks-db";
import { computeAverageReviewScore } from "@/lib/retail-tasks/task-review";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";

/** Shared reliability window — list and drill-down must use the same range. */
export const STAFF_RELIABILITY_PERIOD_DAYS = 30;

export function staffReliabilityDateRange(anchor: Date = new Date()): {
  from: string;
  to: string;
  period_days: number;
} {
  const to = malaysiaDateYmd(anchor);
  const from = addDaysYmd(to, -(STAFF_RELIABILITY_PERIOD_DAYS - 1));
  return { from, to, period_days: STAFF_RELIABILITY_PERIOD_DAYS };
}

export type StaffReliabilityCounts = {
  late_days: number;
  missing_clock_out_days: number;
  missing_clock_in_days: number;
  gps_issues: number;
  review_required_days: number;
  photo_proof_punches: number;
  rejected_task_proofs: number;
  task_review_accepted: number;
  task_review_fair: number;
  task_review_rejected: number;
  overdue_tasks: number;
  task_exceptions: number;
  verified_tasks: number;
  attendance_records: number;
  days_with_punches: number;
  task_records: number;
  avg_final_task_score: number | null;
};

export type StaffReliabilityScoreBreakdown = {
  reliability_score: number | null;
  attendance_score: number | null;
  task_completion_score: number | null;
  operational_compliance_score: number | null;
  gps_compliance_score: number | null;
  photo_compliance_score: number | null;
  score_available: boolean;
};

/** Reliability blend: attendance 40% + task performance 40% + operational compliance 20%. */
export const RELIABILITY_BLEND = {
  attendance: 0.4,
  task_performance: 0.4,
  operational_compliance: 0.2,
} as const;

export type StaffReliabilityScoreDelta = {
  key: string;
  points: number;
  count: number;
};

const STAFF_WEIGHTS = {
  late_day: 5,
  missing_clock_out_day: 8,
  gps_issue: 5,
  fair_review: 1,
  rejected_task_proof: 5,
  overdue_task: 3,
  task_exception: 3,
  photo_proof_punch: 4,
  review_required: 3,
} as const;

export const STAFF_RELIABILITY_FORMULA =
  "40% Attendance + 40% Task Performance + 20% Operational Compliance";

export const STAFF_RELIABILITY_GPS_NOTE =
  "GPS issues are excluded from reliability scoring unless reviewed and confirmed as misuse.";

type StaffDayRow = {
  dayYmd: string;
  late_minutes: number;
  issues: DayIssueStats;
  history: AttendanceRecord[];
};

function buildStaffDayRowsForStaff(
  staffId: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): StaffDayRow[] {
  const byDay = new Map<string, AttendanceRecord[]>();
  for (const p of punches) {
    if (p.staff_id !== staffId) continue;
    const day = p.event_date?.slice(0, 10);
    if (!day) continue;
    const arr = byDay.get(day) ?? [];
    arr.push(p);
    byDay.set(day, arr);
  }

  const rows: StaffDayRow[] = [];
  for (const [dayYmd, dayPunches] of byDay) {
    const dayRows = sortByEventTime(dayPunches);
    if (!staffHasPunchRows(dayRows)) continue;

    const daySchedules = (schedulesByStaffDay.get(staffId)?.get(dayYmd) ?? []).filter(
      (r) => r.status === "active",
    );
    const explicit = pickPrimaryScheduleForDay({
      schedules: daySchedules,
      dayRows,
      shopIdFilter: null,
    });
    const matched = matchStaffDayWithShopSchedule({
      ymd: dayYmd,
      shop: null,
      explicitRow: explicit,
      explicitRows: daySchedules,
      allSchedulesForDay: daySchedules,
      history: dayRows,
      shopIdFilter: null,
    });
    rows.push({
      dayYmd,
      late_minutes: matched.late_minutes ?? 0,
      issues: analyzeDayIssuesWithShift(dayRows, matched.status),
      history: dayRows,
    });
  }
  return rows.sort((a, b) => b.dayYmd.localeCompare(a.dayYmd));
}

export type StaffTaskSummary = {
  overdue: number;
  exceptions: number;
  verified: number;
  fair: number;
  total: number;
};

export function summarizeStaffTasks(
  tasks: Array<{ status: TaskStatus; due_date: string; due_time: string | null }>,
): StaffTaskSummary {
  let overdue = 0;
  let exceptions = 0;
  let verified = 0;
  let fair = 0;
  for (const t of tasks) {
    if (displayTaskStatus(t.status, t.due_date, t.due_time) === "overdue") overdue += 1;
    if (t.status === "exception_reported") exceptions += 1;
    if (t.status === "verified") verified += 1;
    if (t.status === "fair") fair += 1;
  }
  return { overdue, exceptions, verified, fair, total: tasks.length };
}

/** Single source of truth for reliability issue counts (list + drill-down). */
export function aggregateStaffReliabilityCounts(params: {
  staffId: string;
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  rejected_task_proofs?: number;
  task_reviews?: StaffTaskReviewCounts;
  tasks?: Array<{ status: TaskStatus; due_date: string; due_time: string | null }>;
  avg_final_task_score?: number | null;
}): StaffReliabilityCounts {
  const staffPunches = params.punches.filter((p) => p.staff_id === params.staffId);
  const dayRows = buildStaffDayRowsForStaff(
    params.staffId,
    staffPunches,
    params.schedulesByStaffDay,
  );
  const taskSummary = summarizeStaffTasks(params.tasks ?? []);

  let late_days = 0;
  let missing_clock_out_days = 0;
  let missing_clock_in_days = 0;
  let gps_issues = 0;
  let review_required_days = 0;
  let photo_proof_punches = 0;

  for (const row of dayRows) {
    if (row.late_minutes > 0) late_days += 1;
    if (row.issues.missing_clock_out) missing_clock_out_days += 1;
    if (row.issues.badges.includes("missing_clock_in")) missing_clock_in_days += 1;
    gps_issues += gpsIssueCountFromIssues(row.issues);
    if (staffNeedsReviewToday(row.issues, row.history)) review_required_days += 1;
    photo_proof_punches += row.issues.photo_proof_count;
  }

  const task_reviews = params.task_reviews ?? {
    accepted: taskSummary.verified,
    fair: taskSummary.fair,
    rejected: params.rejected_task_proofs ?? 0,
  };

  return {
    late_days,
    missing_clock_out_days,
    missing_clock_in_days,
    gps_issues,
    review_required_days,
    photo_proof_punches,
    rejected_task_proofs: task_reviews.rejected,
    task_review_accepted: task_reviews.accepted,
    task_review_fair: task_reviews.fair,
    task_review_rejected: task_reviews.rejected,
    overdue_tasks: taskSummary.overdue,
    task_exceptions: taskSummary.exceptions,
    verified_tasks: task_reviews.accepted,
    attendance_records: staffPunches.length,
    days_with_punches: dayRows.length,
    task_records: taskSummary.total,
    avg_final_task_score: params.avg_final_task_score ?? null,
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Returns null scores when staff has no punch days in range (not a fake 100). */
export function computeStaffReliabilityScores(
  counts: StaffReliabilityCounts,
): StaffReliabilityScoreBreakdown {
  const score_available = counts.days_with_punches > 0;
  if (!score_available) {
    return {
      reliability_score: null,
      attendance_score: null,
      task_completion_score: null,
      operational_compliance_score: null,
      gps_compliance_score: null,
      photo_compliance_score: null,
      score_available: false,
    };
  }

  const w = STAFF_WEIGHTS;
  const attendance_score = clampScore(
    100 - counts.late_days * w.late_day - counts.missing_clock_out_days * w.missing_clock_out_day,
  );

  const task_completion_score = clampScore(
    counts.avg_final_task_score ??
      (computeAverageReviewScore({
        accepted: counts.task_review_accepted,
        fair: counts.task_review_fair,
        rejected: counts.task_review_rejected,
      }) ?? 100) -
        counts.overdue_tasks * w.overdue_task -
        counts.task_exceptions * w.task_exception,
  );

  const gps_compliance_score = clampScore(
    100 - counts.gps_issues * w.gps_issue - counts.review_required_days * w.review_required,
  );
  const photo_compliance_score = clampScore(100 - counts.photo_proof_punches * w.photo_proof_punch);

  // GPS issues are intentionally excluded from the blended reliability score
  // (they are surfaced separately via gps_compliance_score) so weak/indoor GPS
  // never lowers a staff member's reliability unless reviewed as misuse.
  const operational_compliance_score = clampScore(
    100 -
      counts.overdue_tasks * w.overdue_task -
      counts.task_exceptions * w.task_exception,
  );

  const reliability_score = clampScore(
    attendance_score * RELIABILITY_BLEND.attendance +
      task_completion_score * RELIABILITY_BLEND.task_performance +
      operational_compliance_score * RELIABILITY_BLEND.operational_compliance,
  );

  return {
    score_available: true,
    reliability_score,
    attendance_score,
    task_completion_score,
    operational_compliance_score,
    gps_compliance_score,
    photo_compliance_score,
  };
}

export function buildStaffReliabilityDeltas(counts: StaffReliabilityCounts): StaffReliabilityScoreDelta[] {
  if (counts.days_with_punches === 0) return [];

  const w = STAFF_WEIGHTS;
  const deltas: StaffReliabilityScoreDelta[] = [];
  if (counts.late_days > 0) {
    deltas.push({ key: "late_punch", points: -counts.late_days * w.late_day, count: counts.late_days });
  }
  if (counts.missing_clock_out_days > 0) {
    deltas.push({
      key: "missing_clock_out",
      points: -counts.missing_clock_out_days * w.missing_clock_out_day,
      count: counts.missing_clock_out_days,
    });
  }
  if (counts.task_review_fair > 0) {
    deltas.push({
      key: "fair_review",
      points: -counts.task_review_fair * w.fair_review,
      count: counts.task_review_fair,
    });
  }
  if (counts.task_review_rejected > 0) {
    deltas.push({
      key: "rejected_task",
      points: -counts.task_review_rejected * w.rejected_task_proof,
      count: counts.task_review_rejected,
    });
  }
  if (counts.overdue_tasks > 0) {
    deltas.push({
      key: "overdue_task",
      points: -counts.overdue_tasks * w.overdue_task,
      count: counts.overdue_tasks,
    });
  }
  if (counts.task_exceptions > 0) {
    deltas.push({
      key: "task_exception",
      points: -counts.task_exceptions * w.task_exception,
      count: counts.task_exceptions,
    });
  }
  if (counts.photo_proof_punches > 0) {
    deltas.push({
      key: "missing_photo_proof",
      points: -counts.photo_proof_punches * w.photo_proof_punch,
      count: counts.photo_proof_punches,
    });
  }
  return deltas;
}

export function buildStaffDayRowsForIncidents(
  staffId: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): StaffDayRow[] {
  return buildStaffDayRowsForStaff(staffId, punches, schedulesByStaffDay);
}

export type StaffReliabilityDebug = {
  employee_id: string;
  date_range: { from: string; to: string };
  attendance_records_count: number;
  task_records_count: number;
  gps_issue_count: number;
  photo_issue_count: number;
  calculated_score: number | null;
  list_score?: number | null;
  score_mismatch?: boolean;
};
