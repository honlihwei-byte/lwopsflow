import { addDaysYmd, shopNamesVisited, type AttendanceRecord } from "@/lib/attendance";
import { fetchAttendanceInRange } from "@/lib/attendance-db";
import { shopIdsForCompany } from "@/lib/company-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  buildDayStaffAttention,
  computeShopHealthRows,
  computeStaffReliabilityRows,
} from "@/lib/operations-intelligence";
import { safeGetRejectedProofCountsByStaff, safeGetTaskShopStatsForDates } from "@/lib/operations-intelligence-queries";
import type { ShopScoreDrillDown, StaffScoreDrillDown } from "@/lib/score-drilldown";
import { computeShopScoreDrillDown, computeStaffScoreDrillDown } from "@/lib/score-drilldown";
import { staffReliabilityDateRange } from "@/lib/staff-reliability";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import { loadSchedulesForStaffIdsInRange } from "@/lib/shifts/staff-schedules-db";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

function taskMapForDay(
  taskByDate: Map<string, Map<string, { task_count: number; overdue: number; exceptions: number }>>,
  ymd: string,
  shopIds: string[],
) {
  const dayMap = taskByDate.get(ymd) ?? new Map();
  const result = new Map<string, { task_count: number; overdue: number; exceptions: number }>();
  for (const shopId of shopIds) {
    result.set(shopId, dayMap.get(shopId) ?? { task_count: 0, overdue: 0, exceptions: 0 });
  }
  return result;
}

export async function loadStaffScoreDrillDown(
  supabase: Supabase,
  companyId: string,
  staffId: string,
  listScore?: number | null,
): Promise<StaffScoreDrillDown | null> {
  const { from, to, period_days } = staffReliabilityDateRange();

  const { data: staffRow, error: staffErr } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code")
    .eq("company_id", companyId)
    .eq("id", staffId)
    .eq("status", "active")
    .maybeSingle();
  if (staffErr || !staffRow) return null;

  const companyShopIds = await shopIdsForCompany(supabase, companyId);
  const shopNameById = new Map<string, string>();
  if (companyShopIds.length > 0) {
    const { data: shops } = await supabase.from("shops").select("id, name").in("id", companyShopIds);
    for (const s of shops ?? []) {
      shopNameById.set(String(s.id), String(s.name ?? "Shop"));
    }
  }

  const allPunches = await fetchAttendanceInRange(supabase, from, to, null, companyShopIds);
  const punches = allPunches.filter((p) => p.staff_id === staffId);

  const schedules = await loadSchedulesForStaffIdsInRange(supabase, {
    staffIds: [staffId],
    from,
    to,
  });

  const sinceIso = `${from}T00:00:00+08:00`;
  const { safeGetTaskReviewCountsByStaff } = await import("@/lib/operations-intelligence-queries");
  const reviewResult = await safeGetTaskReviewCountsByStaff(supabase, companyId, sinceIso);
  const task_reviews = reviewResult.counts.get(staffId);
  const rejected_task_proofs = task_reviews?.rejected ?? 0;

  const { data: taskRows } = await supabase
    .from("retail_tasks")
    .select("id, shop_id, status, due_date, due_time, title")
    .eq("company_id", companyId)
    .eq("assigned_staff_id", staffId)
    .gte("due_date", from)
    .lte("due_date", to);

  const tasks = (taskRows ?? []).map((r) => ({
    id: String(r.id),
    shop_id: String(r.shop_id),
    status: r.status as TaskStatus,
    due_date: String(r.due_date),
    due_time: (r.due_time as string | null) ?? null,
    title: String(r.title ?? "Task"),
  }));

  return computeStaffScoreDrillDown({
    staff: { id: String(staffRow.id), staff_name: String(staffRow.staff_name) },
    shop_label: shopNamesVisited(punches),
    date_from: from,
    date_to: to,
    period_days,
    punches,
    schedulesByStaffDay: schedules,
    rejected_task_proofs,
    task_reviews,
    tasks,
    shopNameById,
    list_score: listScore,
  });
}

export async function loadShopScoreDrillDown(
  supabase: Supabase,
  companyId: string,
  shopId: string,
): Promise<ShopScoreDrillDown | null> {
  const today = malaysiaDateYmd(new Date());
  const { from: thirtyDaysAgo } = staffReliabilityDateRange();
  const fourteenDaysAgo = addDaysYmd(today, -13);
  const sevenDaysAgo = addDaysYmd(today, -6);
  const previousSevenStart = addDaysYmd(today, -13);

  const companyShopIds = await shopIdsForCompany(supabase, companyId);
  if (!companyShopIds.includes(shopId)) return null;

  const { data: shopRow, error: shopErr } = await supabase
    .from("shops")
    .select("id, name")
    .eq("id", shopId)
    .maybeSingle();
  if (shopErr || !shopRow) return null;

  const shopNameById = new Map<string, string>([[shopId, String(shopRow.name ?? "Shop")]]);

  const { data: staffData } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code")
    .eq("company_id", companyId)
    .eq("status", "active");
  const staff = (staffData ?? []).map((s) => ({
    id: String(s.id),
    staff_name: String(s.staff_name),
    staff_code: String(s.staff_code ?? ""),
  }));
  const staffIds = staff.map((s) => s.id);

  const [dayPunches, rangePunches] = await Promise.all([
    fetchAttendanceInRange(supabase, today, today, null, [shopId]),
    staffIds.length > 0
      ? fetchAttendanceInRange(supabase, thirtyDaysAgo, today, null, companyShopIds)
      : Promise.resolve([] as AttendanceRecord[]),
  ]);

  const schedules = await loadSchedulesForStaffIdsInRange(supabase, {
    staffIds,
    from: fourteenDaysAgo,
    to: today,
  });

  const taskStats = await safeGetTaskShopStatsForDates(supabase, companyId, [today]);
  const todayTaskByShop = taskMapForDay(taskStats.data, today, companyShopIds);

  const shopRows = computeShopHealthRows({
    shops: [{ id: shopId, name: String(shopRow.name) }],
    staff,
    dayYmd: today,
    punches: dayPunches,
    schedulesByStaffDay: schedules,
    taskByShop: todayTaskByShop,
  });
  const shopHealth = shopRows[0];
  if (!shopHealth) return null;

  const { safeGetTaskReviewCountsByStaff } = await import("@/lib/operations-intelligence-queries");
  const reviewResult = await safeGetTaskReviewCountsByStaff(
    supabase,
    companyId,
    `${thirtyDaysAgo}T00:00:00+08:00`,
  );

  const reliabilityRows = computeStaffReliabilityRows({
    staff,
    punches: rangePunches,
    schedulesByStaffDay: schedules,
    taskReviewsByStaff: reviewResult.counts,
    shopNamesFromPunches: shopNamesVisited,
  });
  const reliabilityByStaff = new Map(
    reliabilityRows
      .filter((r) => r.score_available && r.reliability_score != null)
      .map((r) => [r.staff_id, r.reliability_score!]),
  );

  function reliabilityForRange(fromYmd: string, toYmd: string): Map<string, number> {
    const slice = rangePunches.filter((p) => {
      const d = p.event_date?.slice(0, 10);
      return d != null && d >= fromYmd && d <= toYmd;
    });
    const rows = computeStaffReliabilityRows({
      staff,
      punches: slice,
      schedulesByStaffDay: schedules,
      taskReviewsByStaff: reviewResult.counts,
      shopNamesFromPunches: shopNamesVisited,
    });
    return new Map(
      rows
        .filter((r) => r.score_available && r.reliability_score != null)
        .map((r) => [r.staff_id, r.reliability_score!]),
    );
  }

  const currentRel = reliabilityForRange(sevenDaysAgo, today);
  const previousRel = reliabilityForRange(previousSevenStart, addDaysYmd(sevenDaysAgo, -1));
  const reliabilityTrendByStaff = new Map<string, { current: number; previous: number }>();
  for (const [id, current] of currentRel) {
    const previous = previousRel.get(id) ?? current;
    reliabilityTrendByStaff.set(id, { current, previous });
  }

  const attention = buildDayStaffAttention(staff, today, dayPunches, schedules, shopNameById);
  const todayAttentionStaffIds = new Set(attention.map((a) => a.staff_id));

  return computeShopScoreDrillDown({
    shopRow: shopHealth,
    date: today,
    staff,
    punches: dayPunches,
    schedulesByStaffDay: schedules,
    reliabilityByStaff,
    reliabilityTrendByStaff,
    todayAttentionStaffIds,
  });
}
