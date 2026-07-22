import { addDaysYmd, shopNamesVisited, type AttendanceRecord } from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  computeShopHealthRows,
  computeStaffReliabilityRows,
  type ShopTaskCounts,
} from "@/lib/operations-intelligence";
import type { TaskShopDayCounts } from "@/lib/operations-intelligence-queries";
import {
  aggregateStaffReliabilityCounts,
  computeStaffReliabilityScores,
} from "@/lib/staff-reliability";
import type { StaffTaskReviewCounts } from "@/lib/retail-tasks/retail-tasks-db";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type PerformancePeriod = "month" | "week" | "day";

export type PeriodRange = { from: string; to: string };

export type ScoreComparison = {
  current: number | null;
  previous: number | null;
  delta: number | null;
};

export type PerformanceScores = {
  reliability: ScoreComparison;
  task: ScoreComparison;
  compliance: ScoreComparison;
  attendance_health: ScoreComparison;
};

export type OutletRankingRow = {
  shop_id: string;
  shop_name: string;
  score: number;
  previous_score: number | null;
  delta: number | null;
  rank: number;
};

export type EmployeeRankingRow = {
  staff_id: string;
  staff_name: string;
  shop_label: string;
  reliability_score: number;
  previous_score: number | null;
  delta: number | null;
  rank: number;
};

export type PerformanceAnalyticsPayload = {
  period: PerformancePeriod;
  period_label: string;
  previous_period_label: string;
  current_range: PeriodRange;
  previous_range: PeriodRange;
  scores: PerformanceScores;
  outlet_ranking: OutletRankingRow[];
  employee_ranking: EmployeeRankingRow[];
};

type StaffRow = { id: string; staff_name: string; staff_code: string };
type ShopRow = { id: string; name: string };

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function startOfWeekMonday(ymd: string): string {
  const d = parseYmd(ymd);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  return addDaysYmd(ymd, -diff);
}

function clampPrevEnd(prevStart: string, candidateEnd: string): string {
  const lastYmd = lastDayOfMonthYmd(prevStart);
  return candidateEnd > lastYmd ? lastYmd : candidateEnd;
}

function lastDayOfMonthYmd(anyDayInMonth: string): string {
  const d = parseYmd(anyDayInMonth);
  return malaysiaDateYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function resolvePerformancePeriodRanges(
  period: PerformancePeriod,
  anchor: Date = new Date(),
): {
  period: PerformancePeriod;
  current: PeriodRange;
  previous: PeriodRange;
  period_label: string;
  previous_period_label: string;
} {
  const today = malaysiaDateYmd(anchor);

  if (period === "day") {
    const prev = addDaysYmd(today, -1);
    return {
      period,
      current: { from: today, to: today },
      previous: { from: prev, to: prev },
      period_label: formatDayLabel(today),
      previous_period_label: formatDayLabel(prev),
    };
  }

  if (period === "week") {
    const weekStart = startOfWeekMonday(today);
    const prevWeekEnd = addDaysYmd(weekStart, -1);
    const prevWeekStart = startOfWeekMonday(prevWeekEnd);
    return {
      period,
      current: { from: weekStart, to: today },
      previous: { from: prevWeekStart, to: prevWeekEnd },
      period_label: `${formatDayLabel(weekStart)} – ${formatDayLabel(today)}`,
      previous_period_label: `${formatDayLabel(prevWeekStart)} – ${formatDayLabel(prevWeekEnd)}`,
    };
  }

  const monthStart = monthStartYmd(today);
  const prevMonthAnchor = addDaysYmd(monthStart, -1);
  const prevMonthStart = monthStartYmd(prevMonthAnchor);
  const dayOfMonth = Number(today.slice(8, 10));
  const prevEndCandidate = addDaysYmd(prevMonthStart, dayOfMonth - 1);
  const prevEnd = clampPrevEnd(prevMonthStart, prevEndCandidate);

  return {
    period,
    current: { from: monthStart, to: today },
    previous: { from: prevMonthStart, to: prevEnd },
    period_label: formatMonthLabel(monthStart),
    previous_period_label: formatMonthLabel(prevMonthStart),
  };
}

function formatDayLabel(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonthLabel(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

function averageRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function scoreComparison(current: number | null, previous: number | null): ScoreComparison {
  const delta =
    current != null && previous != null ? Math.round((current - previous) * 10) / 10 : null;
  return { current, previous, delta };
}

function punchesForDay(all: AttendanceRecord[], ymd: string): AttendanceRecord[] {
  return all.filter((p) => p.event_date?.slice(0, 10) === ymd);
}

function taskMapForDay(
  taskByDate: Map<string, Map<string, TaskShopDayCounts>>,
  ymd: string,
  shopIds: string[],
): Map<string, ShopTaskCounts> {
  const dayMap = taskByDate.get(ymd) ?? new Map<string, TaskShopDayCounts>();
  const result = new Map<string, ShopTaskCounts>();
  for (const shopId of shopIds) {
    result.set(shopId, dayMap.get(shopId) ?? { task_count: 0, overdue: 0, exceptions: 0 });
  }
  return result;
}

type StaffTaskRow = { status: TaskStatus; due_date: string; due_time: string | null };

type PeriodMetrics = {
  reliability: number | null;
  task: number | null;
  compliance: number | null;
  attendance_health: number | null;
  outlet_scores: Map<string, number>;
  staff_scores: Map<string, { score: number; name: string; shop_label: string }>;
};

function computePeriodMetrics(params: {
  range: PeriodRange;
  shops: ShopRow[];
  staff: StaffRow[];
  shopIds: string[];
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  taskByDate: Map<string, Map<string, TaskShopDayCounts>>;
  staffTasksByStaff: Map<string, StaffTaskRow[]>;
  rejectedProofsByStaff: Map<string, number>;
  taskReviewsByStaff: Map<string, StaffTaskReviewCounts>;
  avgFinalTaskScoresByStaff: Map<string, number>;
}): PeriodMetrics {
  const dates = datesInRange(params.range.from, params.range.to);
  const shopDailyScores = new Map<string, number[]>();
  for (const shop of params.shops) {
    shopDailyScores.set(shop.id, []);
  }

  let totalLate = 0;
  let totalMissingOut = 0;
  let totalOverdueTasks = 0;
  let totalTaskExceptions = 0;
  let totalScheduledDays = 0;
  let totalPresentDays = 0;

  for (const ymd of dates) {
    const dayPunches = punchesForDay(params.punches, ymd);
    const taskMap = taskMapForDay(params.taskByDate, ymd, params.shopIds);
    const dayShops = computeShopHealthRows({
      shops: params.shops,
      staff: params.staff,
      dayYmd: ymd,
      punches: dayPunches,
      schedulesByStaffDay: params.schedulesByStaffDay,
      taskByShop: taskMap,
    });

    for (const row of dayShops) {
      shopDailyScores.get(row.shop_id)?.push(row.health_score);
      totalLate += row.counts.late;
      totalMissingOut += row.counts.missing_clock_out;
      totalOverdueTasks += row.counts.overdue_tasks;
      totalTaskExceptions += row.counts.task_exceptions;
      totalScheduledDays += row.scheduled_count;
      totalPresentDays += row.present_count;
    }
  }

  const outlet_scores = new Map<string, number>();
  for (const shop of params.shops) {
    const avg = averageRounded(shopDailyScores.get(shop.id) ?? []);
    if (avg != null) outlet_scores.set(shop.id, avg);
  }

  const staffReliabilityRows = computeStaffReliabilityRows({
    staff: params.staff,
    punches: params.punches.filter((p) => {
      const day = p.event_date?.slice(0, 10);
      return day && day >= params.range.from && day <= params.range.to;
    }),
    schedulesByStaffDay: params.schedulesByStaffDay,
    rejectedProofsByStaff: params.rejectedProofsByStaff,
    taskReviewsByStaff: params.taskReviewsByStaff,
    avgFinalTaskScoresByStaff: params.avgFinalTaskScoresByStaff,
    shopNamesFromPunches: shopNamesVisited,
  });

  const staffBreakdowns: Array<{
    staff_id: string;
    name: string;
    shop_label: string;
    reliability: number;
    task: number;
    compliance: number;
  }> = [];

  for (const s of params.staff) {
    const staffPunches = params.punches.filter((p) => {
      if (p.staff_id !== s.id) return false;
      const day = p.event_date?.slice(0, 10);
      return day && day >= params.range.from && day <= params.range.to;
    });
    if (staffPunches.length === 0) continue;

    const counts = aggregateStaffReliabilityCounts({
      staffId: s.id,
      punches: staffPunches,
      schedulesByStaffDay: params.schedulesByStaffDay,
      rejected_task_proofs: params.rejectedProofsByStaff.get(s.id) ?? 0,
      task_reviews: params.taskReviewsByStaff.get(s.id),
      tasks: params.staffTasksByStaff.get(s.id) ?? [],
      avg_final_task_score: params.avgFinalTaskScoresByStaff.get(s.id) ?? null,
    });
    const scores = computeStaffReliabilityScores(counts);
    if (!scores.score_available || scores.reliability_score == null) continue;

    staffBreakdowns.push({
      staff_id: s.id,
      name: s.staff_name,
      shop_label: shopNamesVisited(staffPunches),
      reliability: scores.reliability_score,
      task: scores.task_completion_score ?? scores.reliability_score,
      compliance: scores.operational_compliance_score ?? scores.reliability_score,
    });
  }

  const staff_scores = new Map<string, { score: number; name: string; shop_label: string }>();
  for (const row of staffBreakdowns) {
    staff_scores.set(row.staff_id, {
      score: row.reliability,
      name: row.name,
      shop_label: row.shop_label,
    });
  }

  const reliability =
    staffBreakdowns.length > 0
      ? averageRounded(staffBreakdowns.map((r) => r.reliability))
      : staffReliabilityRows.filter((r) => r.reliability_score != null).length > 0
        ? averageRounded(
            staffReliabilityRows
              .filter((r) => r.reliability_score != null)
              .map((r) => r.reliability_score!),
          )
        : null;

  const task =
    staffBreakdowns.length > 0
      ? averageRounded(staffBreakdowns.map((r) => r.task))
      : null;

  const compliance =
    staffBreakdowns.length > 0
      ? averageRounded(staffBreakdowns.map((r) => r.compliance))
      : null;

  const attendanceRate =
    totalScheduledDays > 0 ? (totalPresentDays / totalScheduledDays) * 100 : null;
  const attendancePenalty =
    totalLate * 3 + totalMissingOut * 5 + (attendanceRate != null ? Math.max(0, 100 - attendanceRate) * 0.5 : 0);
  const attendance_health =
    outlet_scores.size > 0
      ? averageRounded([...outlet_scores.values()])
      : attendanceRate != null
        ? Math.max(0, Math.round(100 - attendancePenalty))
        : null;

  const taskPenalty = totalOverdueTasks * 4 + totalTaskExceptions * 3;
  const task_score_from_ops =
    dates.length > 0 ? Math.max(0, Math.round(100 - taskPenalty / Math.max(1, dates.length))) : null;

  return {
    reliability,
    task: task ?? task_score_from_ops,
    compliance:
      compliance ??
      (dates.length > 0
        ? Math.max(
            0,
            Math.round(
              100 -
                (totalLate * 3 + totalMissingOut * 5 + totalOverdueTasks * 4) /
                  Math.max(1, dates.length),
            ),
          )
        : null),
    attendance_health,
    outlet_scores,
    staff_scores,
  };
}

export function buildPerformanceAnalyticsPayload(params: {
  period: PerformancePeriod;
  shops: ShopRow[];
  staff: StaffRow[];
  shopIds: string[];
  punches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  taskByDate: Map<string, Map<string, TaskShopDayCounts>>;
  staffTasksByStaff: Map<string, StaffTaskRow[]>;
  rejectedProofsByStaff: Map<string, number>;
  taskReviewsByStaff: Map<string, StaffTaskReviewCounts>;
  avgFinalTaskScoresByStaff: Map<string, number>;
  anchor?: Date;
}): PerformanceAnalyticsPayload {
  const ranges = resolvePerformancePeriodRanges(params.period, params.anchor);
  const current = computePeriodMetrics({
    range: ranges.current,
    shops: params.shops,
    staff: params.staff,
    shopIds: params.shopIds,
    punches: params.punches,
    schedulesByStaffDay: params.schedulesByStaffDay,
    taskByDate: params.taskByDate,
    staffTasksByStaff: params.staffTasksByStaff,
    rejectedProofsByStaff: params.rejectedProofsByStaff,
    taskReviewsByStaff: params.taskReviewsByStaff,
    avgFinalTaskScoresByStaff: params.avgFinalTaskScoresByStaff,
  });

  const previous = computePeriodMetrics({
    range: ranges.previous,
    shops: params.shops,
    staff: params.staff,
    shopIds: params.shopIds,
    punches: params.punches,
    schedulesByStaffDay: params.schedulesByStaffDay,
    taskByDate: params.taskByDate,
    staffTasksByStaff: params.staffTasksByStaff,
    rejectedProofsByStaff: params.rejectedProofsByStaff,
    taskReviewsByStaff: params.taskReviewsByStaff,
    avgFinalTaskScoresByStaff: params.avgFinalTaskScoresByStaff,
  });

  const outlet_ranking: OutletRankingRow[] = params.shops
    .map((shop) => {
      const score = current.outlet_scores.get(shop.id) ?? null;
      if (score == null) return null;
      const previous_score = previous.outlet_scores.get(shop.id) ?? null;
      const delta =
        previous_score != null ? Math.round((score - previous_score) * 10) / 10 : null;
      return {
        shop_id: shop.id,
        shop_name: shop.name,
        score,
        previous_score,
        delta,
        rank: 0,
      };
    })
    .filter((row): row is OutletRankingRow => row != null)
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const employee_ranking: EmployeeRankingRow[] = [...current.staff_scores.entries()]
    .map(([staff_id, info]) => {
      const previous_score = previous.staff_scores.get(staff_id)?.score ?? null;
      const delta =
        previous_score != null
          ? Math.round((info.score - previous_score) * 10) / 10
          : null;
      return {
        staff_id,
        staff_name: info.name,
        shop_label: info.shop_label,
        reliability_score: info.score,
        previous_score,
        delta,
        rank: 0,
      };
    })
    .sort((a, b) => b.reliability_score - a.reliability_score)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    period: params.period,
    period_label: ranges.period_label,
    previous_period_label: ranges.previous_period_label,
    current_range: ranges.current,
    previous_range: ranges.previous,
    scores: {
      reliability: scoreComparison(current.reliability, previous.reliability),
      task: scoreComparison(current.task, previous.task),
      compliance: scoreComparison(current.compliance, previous.compliance),
      attendance_health: scoreComparison(current.attendance_health, previous.attendance_health),
    },
    outlet_ranking,
    employee_ranking,
  };
}
