import { NextResponse } from "next/server";
import { fetchAttendanceInRange } from "@/lib/attendance-db";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById, shopIdsForCompany } from "@/lib/company-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  safeGetAverageFinalTaskScoresByStaff,
  safeGetTaskReviewCountsByStaff,
  safeGetTaskShopStatsForDates,
} from "@/lib/operations-intelligence-queries";
import {
  buildPerformanceAnalyticsPayload,
  datesInRange,
  type PerformancePeriod,
} from "@/lib/performance-analytics";
import {
  getOperationsDashboardCache,
  operationsDashboardCacheKey,
  setOperationsDashboardCache,
} from "@/lib/operations-dashboard-cache";
import { loadSchedulesForStaffIdsInRange } from "@/lib/shifts/staff-schedules-db";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_PERIODS: PerformancePeriod[] = ["month", "week", "day"];

function parsePeriod(raw: string | null): PerformancePeriod {
  if (raw === "week" || raw === "day") return raw;
  return "month";
}

export async function GET(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const opsBlock = blockSuperAdminFromOps(session);
  if (opsBlock) return opsBlock;

  const companyId = session.companyId!;
  const period = parsePeriod(new URL(req.url).searchParams.get("period"));
  const cacheKey = operationsDashboardCacheKey(companyId, `performance:${period}`);
  const cached = getOperationsDashboardCache<ReturnType<typeof buildPerformanceAnalyticsPayload>>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, companyId);
    if (company) {
      const sub = await getSubscriptionForCompany(supabase, company);
      if (companyFeatureAccess(company, sub) !== "full") {
        return NextResponse.json(
          {
            error: "Subscription required.",
            code: "SUBSCRIPTION_REQUIRED",
            redirect: "/subscription-required",
          },
          { status: 402 },
        );
      }
    }

    const shopIds = await shopIdsForCompany(supabase, companyId);
    if (shopIds.length === 0) {
      const empty = buildPerformanceAnalyticsPayload({
        period,
        shops: [],
        staff: [],
        shopIds: [],
        punches: [],
        schedulesByStaffDay: new Map(),
        taskByDate: new Map(),
        staffTasksByStaff: new Map(),
        rejectedProofsByStaff: new Map(),
        taskReviewsByStaff: new Map(),
        avgFinalTaskScoresByStaff: new Map(),
      });
      setOperationsDashboardCache(cacheKey, empty);
      return NextResponse.json(empty);
    }

    const { data: shopRows, error: shopsErr } = await supabase
      .from("shops")
      .select("id, name")
      .in("id", shopIds)
      .order("name", { ascending: true });
    if (shopsErr) throw new Error(shopsErr.message);
    const shops = (shopRows ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? "Shop"),
    }));

    const { data: staffData, error: staffErr } = await supabase
      .from("staff")
      .select("id, staff_name, staff_code")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("staff_name", { ascending: true });
    if (staffErr) throw new Error(staffErr.message);
    const staff = (staffData ?? []) as Array<{ id: string; staff_name: string; staff_code: string }>;
    const staffIds = staff.map((s) => s.id);

    const today = malaysiaDateYmd(new Date());
    const monthStart = `${today.slice(0, 7)}-01`;
    const dataFrom = `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`;

    const [punches, schedulesRange, taskStatsResult, staffTasksRes] = await Promise.all([
      staffIds.length > 0
        ? fetchAttendanceInRange(supabase, dataFrom, today, null, shopIds)
        : Promise.resolve([]),
      staffIds.length > 0
        ? loadSchedulesForStaffIdsInRange(supabase, {
            staffIds,
            from: dataFrom,
            to: today,
          })
        : Promise.resolve(new Map()),
      safeGetTaskShopStatsForDates(
        supabase,
        companyId,
        datesInRange(dataFrom, today),
      ),
      supabase
        .from("retail_tasks")
        .select("assigned_staff_id, status, due_date, due_time")
        .eq("company_id", companyId)
        .gte("due_date", dataFrom)
        .lte("due_date", today)
        .not("assigned_staff_id", "is", null),
    ]);

    const staffTasksByStaff = new Map<
      string,
      Array<{ status: TaskStatus; due_date: string; due_time: string | null }>
    >();
    for (const row of staffTasksRes.data ?? []) {
      if (!row.assigned_staff_id) continue;
      const id = String(row.assigned_staff_id);
      const list = staffTasksByStaff.get(id) ?? [];
      list.push({
        status: row.status as TaskStatus,
        due_date: String(row.due_date),
        due_time: row.due_time != null ? String(row.due_time).slice(0, 5) : null,
      });
      staffTasksByStaff.set(id, list);
    }

    const sinceIso = `${dataFrom}T00:00:00+08:00`;
    const [reviewResult, avgScoreResult] = await Promise.all([
      safeGetTaskReviewCountsByStaff(supabase, companyId, sinceIso),
      safeGetAverageFinalTaskScoresByStaff(supabase, companyId, sinceIso),
    ]);

    const taskReviewsByStaff = reviewResult.counts;
    const rejectedProofsByStaff = new Map<string, number>();
    for (const [staffId, counts] of taskReviewsByStaff) {
      rejectedProofsByStaff.set(staffId, counts.rejected);
    }

    const payload = buildPerformanceAnalyticsPayload({
      period,
      shops,
      staff,
      shopIds,
      punches,
      schedulesByStaffDay: schedulesRange,
      taskByDate: taskStatsResult.data,
      staffTasksByStaff,
      rejectedProofsByStaff,
      taskReviewsByStaff,
      avgFinalTaskScoresByStaff: avgScoreResult.scores,
    });

    setOperationsDashboardCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[performance-analytics]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load performance analytics." },
      { status: 500 },
    );
  }
}
