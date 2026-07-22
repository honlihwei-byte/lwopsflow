import type { DayIssueStats } from "@/lib/attendance-report";
import { attendanceForTotals, type AttendanceRecord } from "@/lib/attendance";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import {
  buildHealthReasons,
  gpsIssueCountFromIssues,
  staffNeedsReviewToday,
  type HealthReason,
  type ShopHealthCounts,
} from "@/lib/operations-dashboard";
import {
  aggregateStaffReliabilityCounts,
  buildStaffDayRowsForIncidents,
  buildStaffReliabilityDeltas,
  computeStaffReliabilityScores,
  STAFF_RELIABILITY_FORMULA,
  STAFF_RELIABILITY_GPS_NOTE,
  type StaffReliabilityDebug,
} from "@/lib/staff-reliability";
import type { ShopHealthRow } from "@/lib/operations-intelligence";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";

/** Documented weights — keep in sync with operations-dashboard.ts */
export const SCORE_WEIGHTS = {
  shop: {
    late: 5,
    missing_clock_out: 8,
    gps_issues: 5,
    review_required: 5,
    overdue_tasks: 5,
    task_exceptions: 3,
  },
  staff: {
    late_day: 5,
    missing_clock_out_day: 8,
    gps_issue: 5,
    rejected_task_proof: 5,
    overdue_task: 3,
    task_exception: 3,
    photo_proof_punch: 4,
    review_required: 3,
    verified_task: 2,
    perfect_attendance_day: 1,
  },
} as const;

export type ScoreDelta = {
  key: string;
  points: number;
  count: number;
};

export type ScoreIncident = {
  at: string;
  date_ymd: string;
  type: string;
  label_key: string;
  detail?: string;
  shop_name?: string;
};

export type StaffContributingFactors = {
  late_punches: number;
  missing_clock_out: number;
  missing_clock_in: number;
  gps_issues: number;
  overdue_tasks: number;
  rejected_tasks: number;
  photo_proof_punches: number;
  review_required: number;
  task_exceptions: number;
  verified_tasks: number;
  attendance_records: number;
  task_records: number;
};

export type StaffScoreDrillDown = {
  staff_id: string;
  staff_name: string;
  shop_label: string;
  period_days: number;
  date_from: string;
  date_to: string;
  score_available: boolean;
  reliability_score: number | null;
  attendance_score: number | null;
  task_completion_score: number | null;
  gps_compliance_score: number | null;
  photo_compliance_score: number | null;
  contributing_factors: StaffContributingFactors;
  score_deltas: ScoreDelta[];
  incidents: ScoreIncident[];
  formula: {
    reliability: string;
    attendance: string;
    task_completion: string;
    gps_compliance: string;
    photo_compliance: string;
    gps_reliability_note?: string;
  };
  debug?: StaffReliabilityDebug;
};

export type ShopStaffHighlight = {
  staff_id: string;
  staff_name: string;
  score: number;
  note_key: string;
  delta?: number;
};

export type ShopScoreDrillDown = {
  shop_id: string;
  shop_name: string;
  date: string;
  health_score: number;
  attendance_score: number;
  task_score: number;
  gps_score: number;
  compliance_score: number;
  counts: ShopHealthCounts;
  reasons: HealthReason[];
  score_deltas: ScoreDelta[];
  best_performer: ShopStaffHighlight | null;
  most_improved: ShopStaffHighlight | null;
  needs_attention: ShopStaffHighlight[];
  incident_summary: Array<{ type: string; count: number; label_key: string }>;
  incidents: ScoreIncident[];
  formula: {
    health: string;
    attendance: string;
    task: string;
    gps: string;
    compliance: string;
  };
};

type StaffDayRow = {
  dayYmd: string;
  late_minutes: number;
  issues: DayIssueStats;
  history: AttendanceRecord[];
};

type StaffTaskRow = {
  id: string;
  shop_id: string;
  status: TaskStatus;
  due_date: string;
  due_time: string | null;
  title: string;
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function shopSubScores(counts: ShopHealthCounts) {
  const w = SCORE_WEIGHTS.shop;
  return {
    attendance_score: clampScore(
      100 - counts.late * w.late - counts.missing_clock_out * w.missing_clock_out,
    ),
    task_score: clampScore(
      100 - counts.overdue_tasks * w.overdue_tasks - counts.task_exceptions * w.task_exceptions,
    ),
    gps_score: clampScore(100 - counts.gps_issues * w.gps_issues),
    compliance_score: clampScore(100 - counts.review_required * w.review_required),
  };
}

export function buildShopScoreDeltas(counts: ShopHealthCounts): ScoreDelta[] {
  const w = SCORE_WEIGHTS.shop;
  const deltas: ScoreDelta[] = [];
  if (counts.late > 0) deltas.push({ key: "late_punch", points: -counts.late * w.late, count: counts.late });
  if (counts.missing_clock_out > 0) {
    deltas.push({
      key: "missing_clock_out",
      points: -counts.missing_clock_out * w.missing_clock_out,
      count: counts.missing_clock_out,
    });
  }
  if (counts.gps_issues > 0) {
    deltas.push({ key: "gps_issue", points: -counts.gps_issues * w.gps_issues, count: counts.gps_issues });
  }
  if (counts.review_required > 0) {
    deltas.push({
      key: "review_required",
      points: -counts.review_required * w.review_required,
      count: counts.review_required,
    });
  }
  if (counts.overdue_tasks > 0) {
    deltas.push({
      key: "overdue_task",
      points: -counts.overdue_tasks * w.overdue_tasks,
      count: counts.overdue_tasks,
    });
  }
  if (counts.task_exceptions > 0) {
    deltas.push({
      key: "task_exception",
      points: -counts.task_exceptions * w.task_exceptions,
      count: counts.task_exceptions,
    });
  }
  return deltas;
}

function staffIncidentsFromRows(
  dayRows: StaffDayRow[],
  shopNameById: Map<string, string>,
  tasks: StaffTaskRow[],
): ScoreIncident[] {
  const incidents: ScoreIncident[] = [];

  for (const row of dayRows) {
    const shopId = attendanceForTotals(row.history)[0]?.shop_id;
    const shop_name = shopId ? shopNameById.get(shopId) : undefined;
    const lastPunch = row.history[row.history.length - 1];
    const at = lastPunch?.event_time ?? `${row.dayYmd}T12:00:00+08:00`;

    if (row.late_minutes > 0) {
      incidents.push({
        at,
        date_ymd: row.dayYmd,
        type: "late",
        label_key: "drilldown.incident.late",
        detail: `${row.late_minutes}m`,
        shop_name,
      });
    }
    if (row.issues.missing_clock_out || row.issues.badges.includes("missing_clock_in")) {
      incidents.push({
        at,
        date_ymd: row.dayYmd,
        type: "missing_punch",
        label_key: "drilldown.incident.missing_punch",
        shop_name,
      });
    }
    if (gpsIssueCountFromIssues(row.issues) > 0) {
      incidents.push({
        at,
        date_ymd: row.dayYmd,
        type: "gps",
        label_key: "drilldown.incident.gps",
        shop_name,
      });
    }
    if (row.issues.photo_proof_count > 0) {
      incidents.push({
        at,
        date_ymd: row.dayYmd,
        type: "photo_proof",
        label_key: "drilldown.incident.photo_proof",
        shop_name,
      });
    }
    if (staffNeedsReviewToday(row.issues, row.history)) {
      incidents.push({
        at,
        date_ymd: row.dayYmd,
        type: "review",
        label_key: "drilldown.incident.review",
        shop_name,
      });
    }
  }

  for (const task of tasks) {
    const display = displayTaskStatus(task.status, task.due_date, task.due_time);
    if (display === "overdue") {
      incidents.push({
        at: `${task.due_date}T23:59:00+08:00`,
        date_ymd: task.due_date,
        type: "overdue_task",
        label_key: "drilldown.incident.overdue_task",
        detail: task.title,
        shop_name: shopNameById.get(task.shop_id),
      });
    }
    if (task.status === "exception_reported") {
      incidents.push({
        at: `${task.due_date}T12:00:00+08:00`,
        date_ymd: task.due_date,
        type: "task_exception",
        label_key: "drilldown.incident.task_exception",
        detail: task.title,
        shop_name: shopNameById.get(task.shop_id),
      });
    }
  }

  return incidents
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);
}

export function computeStaffScoreDrillDown(params: {
  staff: { id: string; staff_name: string };
  shop_label: string;
  date_from: string;
  date_to: string;
  period_days: number;
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  rejected_task_proofs: number;
  task_reviews?: import("@/lib/retail-tasks/retail-tasks-db").StaffTaskReviewCounts;
  tasks: StaffTaskRow[];
  shopNameById: Map<string, string>;
  list_score?: number | null;
}): StaffScoreDrillDown {
  const {
    staff,
    shop_label,
    date_from,
    date_to,
    period_days,
    punches,
    schedulesByStaffDay,
    rejected_task_proofs,
    task_reviews,
    tasks,
    shopNameById,
    list_score,
  } = params;

  const counts = aggregateStaffReliabilityCounts({
    staffId: staff.id,
    punches,
    schedulesByStaffDay,
    rejected_task_proofs,
    task_reviews,
    tasks,
  });
  const scores = computeStaffReliabilityScores(counts);
  const dayRows = buildStaffDayRowsForIncidents(staff.id, punches, schedulesByStaffDay);

  const contributing_factors: StaffContributingFactors = {
    late_punches: counts.late_days,
    missing_clock_out: counts.missing_clock_out_days,
    missing_clock_in: counts.missing_clock_in_days,
    gps_issues: counts.gps_issues,
    overdue_tasks: counts.overdue_tasks,
    rejected_tasks: counts.task_review_rejected,
    photo_proof_punches: counts.photo_proof_punches,
    review_required: counts.review_required_days,
    task_exceptions: counts.task_exceptions,
    verified_tasks: counts.task_review_accepted,
    attendance_records: counts.attendance_records,
    task_records: counts.task_records,
  };

  const score_mismatch =
    list_score != null &&
    scores.reliability_score != null &&
    list_score !== scores.reliability_score;

  if (score_mismatch && process.env.NODE_ENV === "development") {
    console.warn("[staff-reliability] list vs drill-down score mismatch", {
      staff_id: staff.id,
      list_score,
      calculated_score: scores.reliability_score,
      date_from,
      date_to,
      attendance_records_count: counts.attendance_records,
    });
  }

  const debug: StaffReliabilityDebug = {
    employee_id: staff.id,
    date_range: { from: date_from, to: date_to },
    attendance_records_count: counts.attendance_records,
    task_records_count: counts.task_records,
    gps_issue_count: counts.gps_issues,
    photo_issue_count: counts.photo_proof_punches,
    calculated_score: scores.reliability_score,
    list_score: list_score ?? null,
    score_mismatch,
  };

  return {
    staff_id: staff.id,
    staff_name: staff.staff_name,
    shop_label,
    period_days,
    date_from,
    date_to,
    score_available: scores.score_available,
    reliability_score: scores.reliability_score,
    attendance_score: scores.attendance_score,
    task_completion_score: scores.task_completion_score,
    gps_compliance_score: scores.gps_compliance_score,
    photo_compliance_score: scores.photo_compliance_score,
    contributing_factors,
    score_deltas: buildStaffReliabilityDeltas(counts),
    incidents: staffIncidentsFromRows(dayRows, shopNameById, tasks),
    formula: {
      reliability: STAFF_RELIABILITY_FORMULA,
      attendance: "100 − (late days×5) − (missing clock-out days×8)",
      task_completion:
        "avg review score (Accepted=100, Fair=70, Rejected=0) − (overdue×3) − (exceptions×3)",
      gps_compliance: "100 − (GPS issues×5) − (review flags×3) — informational only",
      photo_compliance: "100 − (photo-proof punches×4)",
      gps_reliability_note: STAFF_RELIABILITY_GPS_NOTE,
    },
    debug:
      process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PUNCH_TIMING === "1"
        ? debug
        : undefined,
  };
}

function shopIncidentsFromDay(
  shopId: string,
  shopName: string,
  dayYmd: string,
  staff: Array<{ id: string; staff_name: string }>,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): ScoreIncident[] {
  const incidents: ScoreIncident[] = [];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  for (const s of staff) {
    const dayPunches = punches.filter(
      (p) => p.staff_id === s.id && p.event_date?.slice(0, 10) === dayYmd && p.shop_id === shopId,
    );
    if (dayPunches.length === 0) continue;
    const rows = buildStaffDayRowsForIncidents(s.id, dayPunches, schedulesByStaffDay);
    const row = rows[0];
    if (!row) continue;
    const at = row.history[row.history.length - 1]?.event_time ?? `${dayYmd}T12:00:00+08:00`;
    const name = staffById.get(s.id)?.staff_name ?? s.id;

    if (row.late_minutes > 0) {
      incidents.push({
        at,
        date_ymd: dayYmd,
        type: "late",
        label_key: "drilldown.incident.late",
        detail: name,
        shop_name: shopName,
      });
    }
    if (row.issues.missing_clock_out) {
      incidents.push({
        at,
        date_ymd: dayYmd,
        type: "missing_punch",
        label_key: "drilldown.incident.missing_punch",
        detail: name,
        shop_name: shopName,
      });
    }
    if (gpsIssueCountFromIssues(row.issues) > 0) {
      incidents.push({
        at,
        date_ymd: dayYmd,
        type: "gps",
        label_key: "drilldown.incident.gps",
        detail: name,
        shop_name: shopName,
      });
    }
    if (staffNeedsReviewToday(row.issues, row.history)) {
      incidents.push({
        at,
        date_ymd: dayYmd,
        type: "review",
        label_key: "drilldown.incident.review",
        detail: name,
        shop_name: shopName,
      });
    }
  }
  return incidents.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
}

export function computeShopScoreDrillDown(params: {
  shopRow: ShopHealthRow;
  date: string;
  staff: Array<{ id: string; staff_name: string }>;
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  reliabilityByStaff: Map<string, number>;
  reliabilityTrendByStaff: Map<string, { current: number; previous: number }>;
  todayAttentionStaffIds: Set<string>;
}): ShopScoreDrillDown {
  const {
    shopRow,
    date,
    staff,
    punches,
    schedulesByStaffDay,
    reliabilityByStaff,
    reliabilityTrendByStaff,
    todayAttentionStaffIds,
  } = params;

  const counts = shopRow.counts;
  const subs = shopSubScores(counts);
  const shopStaffIds = new Set<string>();
  for (const p of punches) {
    if (p.shop_id === shopRow.shop_id && p.event_date?.slice(0, 10) === date) {
      shopStaffIds.add(p.staff_id);
    }
  }

  const shopStaffReliability = staff
    .filter((s) => shopStaffIds.has(s.id) && reliabilityByStaff.has(s.id))
    .map((s) => ({
      staff_id: s.id,
      staff_name: s.staff_name,
      score: reliabilityByStaff.get(s.id)!,
    }));

  const best_performer =
    shopStaffReliability.length > 0
      ? [...shopStaffReliability]
          .sort((a, b) => b.score - a.score)
          .slice(0, 1)
          .map((s) => ({
            staff_id: s.staff_id,
            staff_name: s.staff_name,
            score: s.score,
            note_key: "drilldown.shop.best_performer",
          }))[0] ?? null
      : null;

  let most_improved: ShopStaffHighlight | null = null;
  let bestDelta = -Infinity;
  for (const s of shopStaffReliability) {
    const trend = reliabilityTrendByStaff.get(s.staff_id);
    if (!trend) continue;
    const delta = trend.current - trend.previous;
    if (delta > bestDelta) {
      bestDelta = delta;
      most_improved = {
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        score: trend.current,
        delta: Math.round(delta * 10) / 10,
        note_key: "drilldown.shop.most_improved",
      };
    }
  }

  const needs_attention: ShopStaffHighlight[] = staff
    .filter((s) => shopStaffIds.has(s.id))
    .map((s) => ({
      staff_id: s.id,
      staff_name: s.staff_name,
      score: reliabilityByStaff.get(s.id) ?? 0,
      note_key: todayAttentionStaffIds.has(s.id)
        ? "drilldown.shop.flagged_today"
        : "drilldown.shop.low_reliability",
    }))
    .filter((s) => s.score < 75 || todayAttentionStaffIds.has(s.staff_id))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const incident_summary = buildHealthReasons(counts).map((r) => ({
    type: r.key,
    count: r.count,
    label_key: `drilldown.factor.${r.key}`,
  }));

  return {
    shop_id: shopRow.shop_id,
    shop_name: shopRow.shop_name,
    date,
    health_score: shopRow.health_score,
    ...subs,
    counts,
    reasons: shopRow.reasons,
    score_deltas: buildShopScoreDeltas(counts),
    best_performer,
    most_improved: most_improved && (most_improved.delta ?? 0) > 0 ? most_improved : null,
    needs_attention,
    incident_summary,
    incidents: shopIncidentsFromDay(
      shopRow.shop_id,
      shopRow.shop_name,
      date,
      staff,
      punches,
      schedulesByStaffDay,
    ),
    formula: {
      health:
        "100 − (late×5) − (missing clock-out×8) − (GPS issues×5) − (review×5) − (overdue tasks×5) − (task exceptions×3)",
      attendance: "100 − (late×5) − (missing clock-out×8)",
      task: "100 − (overdue tasks×5) − (task exceptions×3)",
      gps: "100 − (GPS issues×5)",
      compliance: "100 − (review required×5)",
    },
  };
}
