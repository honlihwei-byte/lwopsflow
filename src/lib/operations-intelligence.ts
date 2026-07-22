import {
  analyzeDayIssuesWithShift,
  type DayIssueStats,
} from "@/lib/attendance-report";
import {
  attendanceForTotals,
  sortByEventTime,
  staffHasPunchRows,
  type AttendanceRecord,
} from "@/lib/attendance";
import { riskBadgesForRows } from "@/lib/attendance-risk-badges";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import { isStaffScheduleWorkingShift } from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import {
  computeShopHealthScore,
  gpsIssueCountFromIssues,
  staffNeedsReviewToday,
  type HealthReason,
  type HealthStatusBand,
  type ShopHealthCounts,
  buildHealthReasons,
  healthStatusFromScore,
} from "@/lib/operations-dashboard";
import {
  aggregateStaffReliabilityCounts,
  computeStaffReliabilityScores,
} from "@/lib/staff-reliability";

export type ShopTaskCounts = {
  task_count: number;
  overdue: number;
  exceptions: number;
};

export type ShopHealthRow = {
  shop_id: string;
  shop_name: string;
  present_count: number;
  scheduled_count: number;
  health_score: number;
  status: HealthStatusBand;
  reasons: HealthReason[];
  counts: ShopHealthCounts;
  task_count_today: number;
};

type StaffRow = { id: string; staff_name: string; staff_code: string };

type DayStaffRow = {
  staff_id: string;
  late_minutes: number;
  issues: DayIssueStats;
  history: AttendanceRecord[];
};

function emptyShopBucket() {
  return {
    present: 0,
    scheduled: new Set<string>(),
    late: 0,
    missing_clock_out: 0,
    gps_issues: 0,
    review_required: 0,
    overdue_tasks: 0,
    task_exceptions: 0,
    task_count: 0,
  };
}

function buildDayStaffRows(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): DayStaffRow[] {
  const byStaff = new Map<string, AttendanceRecord[]>();
  for (const p of punches) {
    const arr = byStaff.get(p.staff_id) ?? [];
    arr.push(p);
    byStaff.set(p.staff_id, arr);
  }

  const rows: DayStaffRow[] = [];
  for (const s of staff) {
    const dayRows = sortByEventTime(byStaff.get(s.id) ?? []);
    if (!staffHasPunchRows(dayRows)) continue;

    const daySchedules = (schedulesByStaffDay.get(s.id)?.get(dayYmd) ?? []).filter(
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
    const issues = analyzeDayIssuesWithShift(dayRows, matched.status);
    rows.push({
      staff_id: s.id,
      late_minutes: matched.late_minutes ?? 0,
      issues,
      history: dayRows,
    });
  }
  return rows;
}

export function computeShopHealthRows(params: {
  shops: Array<{ id: string; name: string }>;
  staff: StaffRow[];
  dayYmd: string;
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  taskByShop: Map<string, ShopTaskCounts>;
}): ShopHealthRow[] {
  const { shops, staff, dayYmd, punches, schedulesByStaffDay, taskByShop } = params;
  const dayStaffRows = buildDayStaffRows(staff, dayYmd, punches, schedulesByStaffDay);

  const shopStats = new Map<string, ReturnType<typeof emptyShopBucket>>();
  for (const shop of shops) {
    shopStats.set(shop.id, emptyShopBucket());
  }

  for (const s of staff) {
    const schedules = (schedulesByStaffDay.get(s.id)?.get(dayYmd) ?? []).filter(
      (r) => isStaffScheduleWorkingShift(r),
    );
    for (const sched of schedules) {
      const bucket = shopStats.get(sched.shop_id);
      if (bucket) bucket.scheduled.add(s.id);
    }
  }

  for (const taskShopId of taskByShop.keys()) {
    const bucket = shopStats.get(taskShopId);
    const taskCounts = taskByShop.get(taskShopId)!;
    if (bucket) {
      bucket.overdue_tasks = taskCounts.overdue;
      bucket.task_exceptions = taskCounts.exceptions;
      bucket.task_count = taskCounts.task_count;
    }
  }

  for (const row of dayStaffRows) {
    const shopIds = new Set(
      attendanceForTotals(row.history)
        .map((r) => r.shop_id)
        .filter(Boolean),
    );
    for (const shopId of shopIds) {
      const bucket = shopStats.get(shopId);
      if (!bucket) continue;
      bucket.present += 1;
      if (row.late_minutes > 0) bucket.late += 1;
      if (row.issues.missing_clock_out) bucket.missing_clock_out += 1;
      bucket.gps_issues += gpsIssueCountFromIssues(row.issues);
      if (staffNeedsReviewToday(row.issues, row.history)) bucket.review_required += 1;
    }
  }

  return shops.map((shop) => {
    const bucket = shopStats.get(shop.id)!;
    const counts: ShopHealthCounts = {
      late: bucket.late,
      missing_clock_out: bucket.missing_clock_out,
      gps_issues: bucket.gps_issues,
      review_required: bucket.review_required,
      overdue_tasks: bucket.overdue_tasks,
      task_exceptions: bucket.task_exceptions,
    };
    const health_score = computeShopHealthScore(counts);
    return {
      shop_id: shop.id,
      shop_name: shop.name,
      present_count: bucket.present,
      scheduled_count: bucket.scheduled.size,
      health_score,
      status: healthStatusFromScore(health_score),
      reasons: buildHealthReasons(counts),
      counts,
      task_count_today: bucket.task_count,
    };
  });
}

export function aggregateTodayRisks(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
  shopRows: ShopHealthRow[],
): {
  late_count: number;
  missing_clock_out_count: number;
  gps_issues_count: number;
  review_required_count: number;
  overdue_tasks_count: number;
  task_exceptions_count: number;
} {
  const dayStaffRows = buildDayStaffRows(staff, dayYmd, punches, schedulesByStaffDay);
  let late_count = 0;
  let missing_clock_out_count = 0;
  let gps_issues_count = 0;
  let review_required_count = 0;

  for (const row of dayStaffRows) {
    if (row.late_minutes > 0) late_count += 1;
    if (row.issues.missing_clock_out) missing_clock_out_count += 1;
    gps_issues_count += gpsIssueCountFromIssues(row.issues);
    if (staffNeedsReviewToday(row.issues, row.history)) review_required_count += 1;
  }

  let overdue_tasks_count = 0;
  let task_exceptions_count = 0;
  for (const shop of shopRows) {
    overdue_tasks_count += shop.counts.overdue_tasks;
    task_exceptions_count += shop.counts.task_exceptions;
  }

  return {
    late_count,
    missing_clock_out_count,
    gps_issues_count,
    review_required_count,
    overdue_tasks_count,
    task_exceptions_count,
  };
}

export function buildDayStaffAttention(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
  shopNameById: Map<string, string>,
) {
  const dayStaffRows = buildDayStaffRows(staff, dayYmd, punches, schedulesByStaffDay);
  const staffById = new Map(staff.map((s) => [s.id, s]));

  return dayStaffRows
    .filter(
      (row) =>
        row.late_minutes > 0 ||
        row.issues.missing_clock_out ||
        staffNeedsReviewToday(row.issues, row.history),
    )
    .map((row) => {
      const reasons: string[] = [];
      if (row.late_minutes > 0) reasons.push("late");
      if (row.issues.missing_clock_out) reasons.push("missing_clock_out");
      const risk = riskBadgesForRows(row.history);
      if (
        risk.includes("buddy_punch") ||
        risk.includes("high_risk") ||
        row.issues.badges.includes("suspicious_punch_sequence")
      ) {
        reasons.push("review");
      } else if (staffNeedsReviewToday(row.issues, row.history)) {
        reasons.push("review");
      }
      const s = staffById.get(row.staff_id);
      const shopIds = [
        ...new Set(
          attendanceForTotals(row.history)
            .map((r) => r.shop_id)
            .filter(Boolean),
        ),
      ] as string[];
      const shop_label =
        shopIds.map((id) => shopNameById.get(id) ?? id).join(", ") || "—";
      return {
        staff_id: row.staff_id,
        staff_name: s?.staff_name ?? row.staff_id,
        shop_label,
        reasons,
      };
    })
    .slice(0, 20);
}

export type StaffReliabilityRow = {
  staff_id: string;
  staff_name: string;
  shop_label: string;
  reliability_score: number | null;
  score_available: boolean;
};

export function computeStaffReliabilityRows(params: {
  staff: StaffRow[];
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  rejectedProofsByStaff?: Map<string, number>;
  taskReviewsByStaff?: Map<string, import("@/lib/retail-tasks/retail-tasks-db").StaffTaskReviewCounts>;
  avgFinalTaskScoresByStaff?: Map<string, number>;
  shopNamesFromPunches: (rows: AttendanceRecord[]) => string;
}): StaffReliabilityRow[] {
  const {
    staff,
    punches,
    schedulesByStaffDay,
    rejectedProofsByStaff,
    taskReviewsByStaff,
    avgFinalTaskScoresByStaff,
    shopNamesFromPunches,
  } = params;

  const byStaffDay = new Map<string, Map<string, AttendanceRecord[]>>();
  for (const p of punches) {
    const day = p.event_date?.slice(0, 10);
    if (!day) continue;
    const staffMap = byStaffDay.get(p.staff_id) ?? new Map<string, AttendanceRecord[]>();
    const arr = staffMap.get(day) ?? [];
    arr.push(p);
    staffMap.set(day, arr);
    byStaffDay.set(p.staff_id, staffMap);
  }

  const rows: StaffReliabilityRow[] = [];

  for (const s of staff) {
    const staffDays = byStaffDay.get(s.id);
    if (!staffDays || staffDays.size === 0) continue;

    const allPunches: AttendanceRecord[] = [];
    for (const dayPunches of staffDays.values()) {
      allPunches.push(...dayPunches);
    }

    const counts = aggregateStaffReliabilityCounts({
      staffId: s.id,
      punches: allPunches,
      schedulesByStaffDay,
      rejected_task_proofs: rejectedProofsByStaff?.get(s.id) ?? 0,
      task_reviews: taskReviewsByStaff?.get(s.id),
      avg_final_task_score: avgFinalTaskScoresByStaff?.get(s.id) ?? null,
    });
    const scores = computeStaffReliabilityScores(counts);

    rows.push({
      staff_id: s.id,
      staff_name: s.staff_name,
      shop_label: shopNamesFromPunches(allPunches),
      reliability_score: scores.reliability_score,
      score_available: scores.score_available,
    });
  }

  return rows;
}

export type MostImprovedShop = {
  shop_id: string;
  shop_name: string;
  current_avg: number;
  previous_avg: number;
  improvement: number;
};

export function computeMostImprovedShops(
  shops: Array<{ id: string; name: string }>,
  dailyScoresByShop: Map<string, number[]>,
  currentDays: number,
  previousDays: number,
): { shops: MostImprovedShop[]; hasEnoughData: boolean } {
  if (currentDays < 1 || previousDays < 1) {
    return { shops: [], hasEnoughData: false };
  }

  const results: MostImprovedShop[] = [];

  for (const shop of shops) {
    const scores = dailyScoresByShop.get(shop.id) ?? [];
    if (scores.length < currentDays + previousDays) continue;

    const previous = scores.slice(0, previousDays);
    const current = scores.slice(previousDays, previousDays + currentDays);
    if (previous.length === 0 || current.length === 0) continue;

    const previous_avg = previous.reduce((a, b) => a + b, 0) / previous.length;
    const current_avg = current.reduce((a, b) => a + b, 0) / current.length;
    results.push({
      shop_id: shop.id,
      shop_name: shop.name,
      current_avg: Math.round(current_avg),
      previous_avg: Math.round(previous_avg),
      improvement: Math.round((current_avg - previous_avg) * 10) / 10,
    });
  }

  const hasEnoughData = results.length > 0;
  const top = [...results].sort((a, b) => b.improvement - a.improvement).slice(0, 3);
  return { shops: top, hasEnoughData };
}

export function highTaskThreshold(taskCounts: number[]): number {
  if (taskCounts.length === 0) return 3;
  const sorted = [...taskCounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return Math.max(3, Math.ceil(median));
}

export type WorkloadInsightShop = {
  shop_id: string;
  shop_name: string;
  health_score: number;
  task_count_today: number;
  scheduled_count: number;
  exception_count: number;
  insight: "performing_well" | "needs_support";
};

export function computeWorkloadInsights(shopRows: ShopHealthRow[]): {
  performing_well: WorkloadInsightShop[];
  needs_support: WorkloadInsightShop[];
} {
  const taskCounts = shopRows.map((s) => s.task_count_today);
  const threshold = highTaskThreshold(taskCounts);

  const performing_well: WorkloadInsightShop[] = [];
  const needs_support: WorkloadInsightShop[] = [];

  for (const shop of shopRows) {
    if (shop.task_count_today < threshold) continue;
    const base = {
      shop_id: shop.shop_id,
      shop_name: shop.shop_name,
      health_score: shop.health_score,
      task_count_today: shop.task_count_today,
      scheduled_count: shop.scheduled_count,
      exception_count: shop.counts.task_exceptions,
    };
    if (shop.health_score > 80) {
      performing_well.push({ ...base, insight: "performing_well" });
    } else if (shop.health_score < 75) {
      needs_support.push({ ...base, insight: "needs_support" });
    }
  }

  return { performing_well, needs_support };
}
