import { NextResponse } from "next/server";
import { sortByEventTime } from "@/lib/attendance";
import { fetchAttendanceInRange } from "@/lib/attendance-db";
import { formatDuration } from "@/lib/attendance";
import { blockSuperAdminFromOps, isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById, shopIdsForCompany } from "@/lib/company-db";
import { kpiFromDaily } from "@/lib/attendance-kpi";
import { normalizePayrollMode } from "@/lib/payroll-mode";
import { defaultStaffSchedule } from "@/lib/staff-schedule";
import { loadSchedulesForStaffIds } from "@/lib/staff-schedule-db";
import { loadSchedulesForStaffIdsInRange } from "@/lib/shifts/staff-schedules-db";
import { buildRangeShiftPerformance, ymdsInRange } from "@/lib/shift-attendance-report";
import { shopSchedulingFromRow } from "@/lib/shop-scheduling";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStaffPositionNames } from "@/lib/permissions/company-positions-db";
import { bodyFromCaught } from "@/lib/supabase/errors";

function parseYmd(v: string | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export async function GET(req: Request) {
  try {
    const session = requireCompanyAdmin(req);
    if (isNextResponse(session)) return session;
    const blocked = blockSuperAdminFromOps(session);
    if (blocked) return blocked;

    const companyId = session.companyId!;
    const supabase = createAdminClient();

    const company = await fetchCompanyById(supabase, companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const sub = await getSubscriptionForCompany(supabase, company);
    if (companyFeatureAccess(company, sub) !== "full") {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    const url = new URL(req.url);
    const from = parseYmd(url.searchParams.get("from"));
    const to = parseYmd(url.searchParams.get("to"));
    const shopIdFilter = url.searchParams.get("shop_id");
    const staffIdFilter = url.searchParams.get("staff_id");

    if (!from || !to || from > to) {
      return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
    }

    const { data: payrollRow } = await supabase
      .from("companies")
      .select("payroll_mode")
      .eq("id", companyId)
      .maybeSingle();
    const payroll_mode = normalizePayrollMode(payrollRow?.payroll_mode);

    const companyShopIds = await shopIdsForCompany(supabase, companyId);
    const shopId =
      shopIdFilter && companyShopIds.includes(shopIdFilter) ? shopIdFilter : null;

    let staffQuery = supabase
      .from("staff")
      .select("id, staff_name, staff_code, staff_type, status")
      .eq("company_id", companyId)
      .eq("status", "active");
    if (staffIdFilter) staffQuery = staffQuery.eq("id", staffIdFilter);

    const { data: staffRows, error: staffErr } = await staffQuery;
    if (staffErr) {
      return NextResponse.json({ error: staffErr.message }, { status: 500 });
    }

    const staff = staffRows ?? [];
    if (staff.length === 0) {
      return NextResponse.json({ rows: [], payroll_mode, from, to });
    }

    const positionNames = await loadStaffPositionNames(
      supabase,
      companyId,
      staff.map((s) => s.id),
    );

    const punches = await fetchAttendanceInRange(
      supabase,
      from,
      to,
      shopId,
      companyShopIds,
    );

    const scheduleMap = await loadSchedulesForStaffIds(
      supabase,
      staff.map((s) => s.id),
    );
    const explicitSchedules = await loadSchedulesForStaffIdsInRange(supabase, {
      staffIds: staff.map((s) => s.id),
      from,
      to,
    });

    let shopScheduling = null;
    if (shopId) {
      const { data: shopRow } = await supabase
        .from("shops")
        .select(
          "id, work_time_mode, opening_time, closing_time, break_minutes, schedule_mode, fixed_daily_start, fixed_daily_end",
        )
        .eq("id", shopId)
        .maybeSingle();
      if (shopRow) shopScheduling = shopSchedulingFromRow(shopRow as Record<string, unknown>);
    }

    const ymds = ymdsInRange(from, to);

    const rows = staff.map((s) => {
      const staffRows = sortByEventTime(punches.filter((p) => p.staff_id === s.id));
      const profile = scheduleMap.get(s.id) ?? defaultStaffSchedule();
      const explicitRaw = explicitSchedules.get(s.id);
      const explicit =
        explicitRaw && shopId
          ? new Map(
              [...explicitRaw.entries()].map(([day, rows]) => [
                day,
                (rows ?? []).filter((r) => r.shop_id === shopId),
              ]),
            )
          : explicitRaw;

      const hasExplicitSchedules = Boolean(explicit && explicit.size > 0);
      const shift_perf = buildRangeShiftPerformance(
        profile,
        ymds,
        staffRows,
        explicit,
        shopScheduling,
        { hasExplicitSchedules, staffType: s.staff_type },
      );

      const kpi = kpiFromDaily(shift_perf.daily, payroll_mode);

      return {
        employee_id: s.id,
        employee_name: s.staff_name,
        employee_code: s.staff_code,
        position_name: positionNames.get(s.id) ?? null,
        working_days: kpi.working_days,
        scheduled_hours_ms: kpi.scheduled_hours_ms,
        scheduled_hours_label: formatDuration(kpi.scheduled_hours_ms),
        actual_hours_ms: kpi.actual_hours_ms,
        actual_hours_label: formatDuration(kpi.actual_hours_ms),
        break_hours_ms: kpi.break_hours_ms,
        break_hours_label: formatDuration(kpi.break_hours_ms),
        payroll_hours_ms: kpi.payroll_hours_ms,
        payroll_hours_label: formatDuration(kpi.payroll_hours_ms),
        late_count: kpi.late_arrival_count,
        absent_count: kpi.absent_days,
        early_arrival_count: kpi.early_arrival_count,
        late_clock_out_count: kpi.late_clock_out_count,
        perfect_attendance_days: kpi.perfect_attendance_days,
      };
    });

    return NextResponse.json({ rows, payroll_mode, from, to });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
