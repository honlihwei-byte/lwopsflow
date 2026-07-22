import { NextResponse } from "next/server";
import {
  analyzeDayIssues,
  buildReportSummary,
  dayCellDetail,
  dayCellDetailWithShop,
  historyMatchesGpsFilter,
  monthStatsFromRows,
  parseGpsStatusFilter,
  parseIssueTypeFilter,
  rowMatchesIssueFilter,
  type DayCellDetail,
  type DayIssueStats,
  type GpsStatusFilter,
  type IssueBadgeType,
  type IssueTypeFilter,
} from "@/lib/attendance-report";
import {
  fetchAttendanceForDay,
  fetchAttendanceInRange,
  matchesEventDate,
  recordEventTime,
} from "@/lib/attendance-db";
import {
  addDaysYmd,
  attendanceForTotals,
  daysInMonth,
  firstClockIn,
  formatDuration,
  lastClockOut,
  punchIssueForDay,
  type AttendanceRecord,
  shopNamesVisited,
  sortByEventTime,
  staffHasPunchRows,
  weekRangeMondayStart,
} from "@/lib/attendance";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { assertShopInCompany, fetchCompanyById, shopIdsForCompany } from "@/lib/company-db";
import { loadSchedulesForStaffIds } from "@/lib/staff-schedule-db";
import { buildMonthShiftPerformance } from "@/lib/shift-attendance-report";
import { defaultStaffSchedule } from "@/lib/staff-schedule";
import { shopSchedulingFromRow, type ShopSchedulingFields } from "@/lib/shop-scheduling";
import { analyzeDayIssuesWithShift } from "@/lib/attendance-report";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { loadSchedulesForStaffIdsInRange, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStaffPositionNames } from "@/lib/permissions/company-positions-db";
import { normalizePayrollMode, payrollHoursMs } from "@/lib/payroll-mode";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

export type ReportView = "attendance" | "absent";

function explicitForShop(
  byStaff: Map<string, Map<string, StaffScheduleRow[]>> | undefined,
  staffId: string,
  day: string,
  shopId: string | null,
  dayRows: AttendanceRecord[],
): StaffScheduleRow | null {
  const rows = byStaff?.get(staffId)?.get(day) ?? [];
  return pickPrimaryScheduleForDay({ schedules: rows, dayRows, shopIdFilter: shopId });
}

function explicitRowsForShop(
  byStaff: Map<string, Map<string, StaffScheduleRow[]>> | undefined,
  staffId: string,
  day: string,
  shopIdFilter: string | null,
): StaffScheduleRow[] {
  const rows = (byStaff?.get(staffId)?.get(day) ?? []).filter((r) => r.status === "active");
  if (shopIdFilter) return rows.filter((r) => r.shop_id === shopIdFilter);
  return rows;
}

async function loadShopSchedulingFields(
  supabase: ReturnType<typeof createAdminClient>,
  shopId: string | null,
): Promise<ShopSchedulingFields | null> {
  if (!shopId) return null;
  const { data } = await supabase
    .from("shops")
    .select("work_time_mode, opening_time, closing_time, break_minutes")
    .eq("id", shopId)
    .maybeSingle();
  if (!data) return null;
  return shopSchedulingFromRow(data as Record<string, unknown>);
}

function shopFilterId(url: URL): string | null {
  const v = url.searchParams.get("shop_id");
  if (!v || v === "__all__") return null;
  return v;
}

function parseReportView(url: URL): ReportView {
  const v = url.searchParams.get("view");
  return v === "absent" ? "absent" : "attendance";
}

function parseIncludeInactive(url: URL): boolean {
  return url.searchParams.get("include_inactive") === "true";
}

type StaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
  staff_type: string;
  status: string;
};

async function loadStaff(
  supabase: ReturnType<typeof createAdminClient>,
  filters: {
    staffId: string | null;
    staffType: string | null;
    shopId: string | null;
    includeInactive: boolean;
    companyId: string | null;
  },
): Promise<StaffRow[]> {
  let staffIdsFilter: string[] | null = null;
  if (filters.shopId) {
    const { data: links, error: linkErr } = await supabase
      .from("staff_shop_assignments")
      .select("staff_id")
      .eq("shop_id", filters.shopId);
    if (linkErr) throw new Error(linkErr.message);
    staffIdsFilter = [...new Set((links ?? []).map((r) => r.staff_id as string))];
    if (staffIdsFilter.length === 0) return [];
  }

  let q = supabase
    .from("staff")
    .select("id, staff_name, staff_code, staff_type, status")
    .order("staff_name", { ascending: true });
  if (filters.companyId) q = q.eq("company_id", filters.companyId);
  if (filters.staffId) q = q.eq("id", filters.staffId);
  if (filters.staffType) q = q.eq("staff_type", filters.staffType);
  if (staffIdsFilter) q = q.in("id", staffIdsFilter);
  if (!filters.includeInactive) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffRow[];
}

async function latestStatusGlobal(
  supabase: ReturnType<typeof createAdminClient>,
  staffIds: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (staffIds.length === 0) return map;
  const { data, error } = await supabase
    .from("attendance")
    .select("staff_id, action_type, created_at, gps_verified, staff_latitude, staff_longitude")
    .in("staff_id", staffIds)
    .order("created_at", { ascending: false })
    .limit(12000);
  if (error) {
    console.error(error);
    return map;
  }
  for (const row of data ?? []) {
    if (map.has(row.staff_id)) continue;
    const legacy = row.staff_latitude == null && row.staff_longitude == null;
    if (!legacy && row.gps_verified !== true) continue;
    map.set(row.staff_id, row.action_type === "clock_in");
  }
  return map;
}

const NON_MISSED_STATUSES = new Set([
  "off_day",
  "not_scheduled",
  "upcoming",
  "mc",
  "al",
  "ul",
  "el",
]);

function staffPassesView(
  hasPunch: boolean,
  view: ReportView,
  attendanceStatus?: string,
  missedShiftCount?: number,
): boolean {
  if (attendanceStatus === "not_scheduled") return false;
  if (attendanceStatus === "upcoming") return view === "attendance";
  if (attendanceStatus && NON_MISSED_STATUSES.has(attendanceStatus)) {
    return view === "attendance";
  }
  if (view === "absent") {
    if ((missedShiftCount ?? 0) > 0) return true;
    if (attendanceStatus === "absent" || attendanceStatus === "partial_attendance") return true;
    return !hasPunch;
  }
  return hasPunch || attendanceStatus === "partial_attendance";
}

function applyAttendanceFilters<T extends { history: AttendanceRecord[]; issues: DayIssueStats }>(
  rows: T[],
  gpsFilter: GpsStatusFilter,
  issueFilter: IssueTypeFilter,
): T[] {
  return rows.filter((row) => {
    if (gpsFilter && !historyMatchesGpsFilter(row.history, gpsFilter)) return false;
    if (!rowMatchesIssueFilter(row.issues, issueFilter)) return false;
    return true;
  });
}

export async function GET(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const opsBlock = blockSuperAdminFromOps(session);
  if (opsBlock) return opsBlock;

  const companyId = session.companyId!;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const shopIdFilter = shopFilterId(url);
  const staffIdFilter = url.searchParams.get("staff_id");
  const staffTypeFilter = url.searchParams.get("staff_type");
  const view = parseReportView(url);
  const includeInactive = parseIncludeInactive(url);
  const gpsFilter = parseGpsStatusFilter(url.searchParams.get("gps_status"));
  const issueFilter = parseIssueTypeFilter(url.searchParams.get("issue_type"));

  if (!mode || (mode !== "day" && mode !== "week" && mode !== "month" && mode !== "range")) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

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

    if (shopIdFilter) {
      const ok = await assertShopInCompany(supabase, shopIdFilter, companyId);
      if (!ok) {
        return NextResponse.json({ error: "Shop not in your company." }, { status: 403 });
      }
    }

    const companyShopIds = await shopIdsForCompany(supabase, companyId);
    if (companyShopIds.length === 0) {
      return NextResponse.json({
        mode,
        view,
        summary: {
          total_present_staff: 0,
          total_hours_ms: 0,
          total_hours_label: "0h 0m",
          missing_clock_out_count: 0,
          weak_indoor_count: 0,
          rejected_gps_count: 0,
          review_required_count: 0,
          gps_issues_count: 0,
        },
        rows: [],
        staffRows: [],
      });
    }

    const staff = await loadStaff(supabase, {
      staffId: staffIdFilter || null,
      staffType: staffTypeFilter || null,
      shopId: shopIdFilter,
      includeInactive,
      companyId,
    });

    const staffIds = staff.map((s) => s.id);
    const latest = await latestStatusGlobal(supabase, staffIds);
    const positionNames = await loadStaffPositionNames(supabase, companyId, staffIds);

    const { data: payrollRow } = await supabase
      .from("companies")
      .select("payroll_mode")
      .eq("id", companyId)
      .maybeSingle();
    const payroll_mode = normalizePayrollMode(payrollRow?.payroll_mode);

    if (mode === "day") {
      const date = url.searchParams.get("date");
      if (!date) {
        return NextResponse.json({ error: "date is required" }, { status: 400 });
      }

      // Always load full company day punches — hours/status use all shops; shop filter is display scope.
      const rows = await fetchAttendanceForDay(supabase, date, null, companyShopIds);
      const explicitDay = await loadSchedulesForStaffIdsInRange(supabase, {
        staffIds: staff.map((s) => s.id),
        from: date,
        to: date,
      });
      const shopScheduling = await loadShopSchedulingFields(supabase, shopIdFilter);
      const byStaff = new Map<string, AttendanceRecord[]>();
      for (const p of rows) {
        const arr = byStaff.get(p.staff_id) ?? [];
        arr.push(p);
        byStaff.set(p.staff_id, arr);
      }

      let staffRows = staff
        .map((s) => {
          const dayRows = byStaff.get(s.id) ?? [];
          const hasPunch = staffHasPunchRows(dayRows);
          const countedRows = attendanceForTotals(dayRows);
          const fi = firstClockIn(dayRows);
          const lo = lastClockOut(dayRows);
          const daySchedules = (explicitDay?.get(s.id)?.get(date) ?? []).filter(
            (r) => r.status === "active",
          );
          const explicit = explicitForShop(explicitDay, s.id, date, shopIdFilter, dayRows);
          const matched = matchStaffDayWithShopSchedule({
            ymd: date,
            shop: shopScheduling,
            explicitRow: explicit,
            explicitRows: shopIdFilter
              ? daySchedules.filter((r) => r.shop_id === shopIdFilter)
              : daySchedules,
            allSchedulesForDay: daySchedules,
            history: dayRows,
            shopIdFilter,
          });
          const hoursMs = matched.worked_hours_ms;
          const breakMs = matched.break_ms;
          const scheduledHoursMs = matched.scheduled_hours_ms;
          const paidHoursMs = payrollHoursMs(payroll_mode, scheduledHoursMs, hoursMs);
          const shiftsToday =
            "shifts_today" in matched ? matched.shifts_today : daySchedules.length > 0 ? 1 : 0;
          const attendedShifts = "attended_shifts" in matched ? matched.attended_shifts : undefined;
          const missedShifts = "missed_shifts" in matched ? matched.missed_shifts : undefined;
          const scheduledLabel =
            "scheduled_label" in matched && matched.scheduled_label
              ? matched.scheduled_label
              : matched.scheduled_start && matched.scheduled_end
                ? `${matched.scheduled_start}–${matched.scheduled_end}`
                : null;
          const isFutureDay = date > malaysiaDateYmd(new Date());
          const attendanceStatus = isFutureDay ? "upcoming" : matched.status;
          const issues = isFutureDay
            ? {
                badges: [] as IssueBadgeType[],
                issue_count: 0,
                missing_clock_out: false,
                weak_indoor_count: 0,
                expanded_radius_count: 0,
                review_required_count: 0,
                rejected_gps_count: 0,
                photo_proof_count: 0,
                manual_approved_count: 0,
                duplicate_prevented_count: 0,
              }
            : analyzeDayIssuesWithShift(dayRows, attendanceStatus);
          if (process.env.DEBUG_REPORT_MATCH === "1") {
            console.log("[report-match]", {
              staff_id: s.id,
              report_date: date,
              matched_schedule_id: explicit?.id ?? null,
              schedule_start: explicit?.start_time ?? null,
              schedule_end: explicit?.end_time ?? null,
              first_in: fi ? recordEventTime(fi) : null,
              final_out: lo ? recordEventTime(lo) : null,
              early_leave_minutes: matched.early_leave_minutes,
              status_reason: matched.status,
            });
          }
          return {
            staff_id: s.id,
            staff_name: s.staff_name,
            staff_code: s.staff_code,
            staff_type: s.staff_type,
            position_name: positionNames.get(s.id) ?? null,
            staff_status: s.status,
            shops_label: shopNamesVisited(dayRows),
            has_punch: hasPunch,
            first_in: fi ? recordEventTime(fi) : null,
            last_out: lo ? recordEventTime(lo) : null,
            scheduled_start: matched.scheduled_start,
            scheduled_end: matched.scheduled_end,
            scheduled_label: scheduledLabel,
            shifts_today: shiftsToday,
            attended_shifts: isFutureDay ? 0 : attendedShifts,
            missed_shifts: isFutureDay ? 0 : missedShifts,
            late_minutes: isFutureDay ? 0 : matched.late_minutes,
            early_leave_minutes: isFutureDay ? 0 : matched.early_leave_minutes,
            overtime_minutes: isFutureDay ? 0 : matched.overtime_minutes,
            attendance_status: attendanceStatus,
            total_hours_ms: hoursMs,
            total_hours_label: formatDuration(hoursMs),
            break_hours_ms: breakMs,
            break_hours_label: formatDuration(breakMs),
            scheduled_hours_ms: scheduledHoursMs,
            scheduled_hours_label: formatDuration(scheduledHoursMs),
            paid_hours_ms: paidHoursMs,
            paid_hours_label: formatDuration(paidHoursMs),
            current_in_shop: latest.get(s.id) ?? false,
            punch_issue: isFutureDay ? null : hasPunch ? punchIssueForDay(dayRows) : null,
            issues,
            history: sortByEventTime(dayRows),
            punch_count: countedRows.length,
          };
        })
        .filter((row) =>
          staffPassesView(row.has_punch, view, row.attendance_status, row.missed_shifts),
        );

      if (view === "attendance") {
        staffRows = applyAttendanceFilters(staffRows, gpsFilter, issueFilter);
      }

      const summary =
        view === "attendance"
          ? buildReportSummary(staffRows)
          : { total_present_staff: staffRows.length, total_hours_ms: 0, total_hours_label: "0h 0m", missing_clock_out_count: 0, weak_indoor_count: 0, rejected_gps_count: 0, review_required_count: 0, gps_issues_count: 0 };

      return NextResponse.json({
        mode,
        view,
        date,
        shop_id: shopIdFilter,
        include_inactive: includeInactive,
        gps_status: gpsFilter || null,
        issue_type: issueFilter || null,
        payroll_mode,
        summary,
        staffRows,
      });
    }

    if (mode === "range") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!from || !to || !dateRe.test(from) || !dateRe.test(to) || from > to) {
        return NextResponse.json({ error: "from and to dates required (YYYY-MM-DD)" }, { status: 400 });
      }

      const punches = await fetchAttendanceInRange(supabase, from, to, null, companyShopIds);
      const explicitRange = await loadSchedulesForStaffIdsInRange(supabase, {
        staffIds: staff.map((s) => s.id),
        from,
        to,
      });
      const shopScheduling = await loadShopSchedulingFields(supabase, shopIdFilter);

      const days: string[] = [];
      let d = from;
      while (d <= to && days.length < 93) {
        days.push(d);
        d = addDaysYmd(d, 1);
      }

      let rows = staff
        .map((s) => {
          const staffPunches = punches.filter((p) => p.staff_id === s.id);
          let total_hours_ms = 0;
          let present_days = 0;
          const daily: Record<string, DayCellDetail> = {};
          for (const day of days) {
            const dayRows = staffPunches.filter((p) => matchesEventDate(p, day));
            const sched = explicitForShop(explicitRange, s.id, day, shopIdFilter, dayRows);
            const daySchedules = explicitRowsForShop(explicitRange, s.id, day, shopIdFilter);
            const cell = dayCellDetailWithShop(staffPunches, day, shopScheduling, sched, {
              explicitRows: daySchedules,
              shopIdFilter,
              payrollMode: payroll_mode,
            });
            daily[day] = cell;
            if (cell.present) present_days += 1;
            total_hours_ms += cell.hours_ms;
          }
          const hasPunch = present_days > 0;
          const allHistory = sortByEventTime(staffPunches);
          const issues = analyzeDayIssues(allHistory);
          return {
            staff_id: s.id,
            staff_name: s.staff_name,
            staff_code: s.staff_code,
            staff_type: s.staff_type,
            position_name: positionNames.get(s.id) ?? null,
            staff_status: s.status,
            shops_label: shopNamesVisited(staffPunches),
            has_punch: hasPunch,
            present_days,
            no_punch_days: Math.max(0, days.length - present_days),
            total_hours_ms,
            total_hours_label: formatDuration(total_hours_ms),
            issues,
            daily,
            history: allHistory,
          };
        })
        .filter((row) => staffPassesView(row.has_punch, view));

      if (view === "attendance") {
        rows = applyAttendanceFilters(rows, gpsFilter, issueFilter);
      }

      const summary =
        view === "attendance"
          ? buildReportSummary(rows)
          : { total_present_staff: rows.length, total_hours_ms: 0, total_hours_label: "0h 0m", missing_clock_out_count: 0, weak_indoor_count: 0, rejected_gps_count: 0, review_required_count: 0, gps_issues_count: 0 };

      return NextResponse.json({
        mode,
        view,
        shop_id: shopIdFilter,
        include_inactive: includeInactive,
        gps_status: gpsFilter || null,
        issue_type: issueFilter || null,
        payroll_mode,
        from,
        to,
        days,
        summary,
        rows,
      });
    }

    if (mode === "week") {
      const weekStart = url.searchParams.get("week_start");
      if (!weekStart) {
        return NextResponse.json({ error: "week_start is required" }, { status: 400 });
      }
      const days = weekRangeMondayStart(weekStart);
      const rangeEnd = days[6];

      const punches = await fetchAttendanceInRange(supabase, weekStart, rangeEnd, null, companyShopIds);
      const explicitWeek = await loadSchedulesForStaffIdsInRange(supabase, {
        staffIds: staff.map((s) => s.id),
        from: weekStart,
        to: rangeEnd,
      });
      const shopScheduling = await loadShopSchedulingFields(supabase, shopIdFilter);

      let reportRows = staff
        .map((s) => {
          const staffPunches = punches.filter((p) => p.staff_id === s.id);
          const daily: Record<string, DayCellDetail> = {};
          let total_present_days = 0;
          let total_hours_ms = 0;
          for (const day of days) {
            const dayRows = staffPunches.filter((p) => matchesEventDate(p, day));
            const sched = explicitForShop(explicitWeek, s.id, day, shopIdFilter, dayRows);
            const daySchedules = explicitRowsForShop(explicitWeek, s.id, day, shopIdFilter);
            const cell = dayCellDetailWithShop(staffPunches, day, shopScheduling, sched, {
              explicitRows: daySchedules,
              shopIdFilter,
              payrollMode: payroll_mode,
            });
            daily[day] = cell;
            if (cell.present) total_present_days += 1;
            total_hours_ms += cell.hours_ms;
          }
          const allHistory = sortByEventTime(staffPunches);
          const issues = analyzeDayIssues(allHistory);
          return {
            staff_id: s.id,
            staff_name: s.staff_name,
            staff_code: s.staff_code,
            staff_type: s.staff_type,
            position_name: positionNames.get(s.id) ?? null,
            staff_status: s.status,
            shops_label: shopNamesVisited(staffPunches),
            has_punch: total_present_days > 0,
            daily,
            total_present_days,
            no_punch_days: Math.max(0, days.length - total_present_days),
            total_hours_ms,
            total_hours_label: formatDuration(total_hours_ms),
            issues,
            history: allHistory,
          };
        })
        .filter((row) => staffPassesView(row.has_punch, view));

      if (view === "attendance") {
        reportRows = applyAttendanceFilters(reportRows, gpsFilter, issueFilter);
      }

      const summary =
        view === "attendance"
          ? buildReportSummary(reportRows)
          : { total_present_staff: reportRows.length, total_hours_ms: 0, total_hours_label: "0h 0m", missing_clock_out_count: 0, weak_indoor_count: 0, rejected_gps_count: 0, review_required_count: 0, gps_issues_count: 0 };

      return NextResponse.json({
        mode,
        view,
        shop_id: shopIdFilter,
        include_inactive: includeInactive,
        gps_status: gpsFilter || null,
        issue_type: issueFilter || null,
        payroll_mode,
        week_start: weekStart,
        days,
        summary,
        rows: reportRows,
      });
    }

    const monthRaw = url.searchParams.get("month");
    if (!monthRaw) {
      return NextResponse.json({ error: "month is required" }, { status: 400 });
    }
    const [yStr, moRaw] = monthRaw.split("-");
    const moNum = Number(moRaw);
    const yNum = Number(yStr);
    if (!yStr || !moRaw || !yNum || !moNum || moNum < 1 || moNum > 12) {
      return NextResponse.json({ error: "invalid month" }, { status: 400 });
    }
    const mo = String(moNum).padStart(2, "0");
    const m0 = moNum - 1;
    const dim = daysInMonth(yNum, m0);
    const start = `${yStr}-${mo}-01`;
    const end = `${yStr}-${mo}-${String(dim).padStart(2, "0")}`;

    const punches = await fetchAttendanceInRange(supabase, start, end, null, companyShopIds);
    const scheduleMap = await loadSchedulesForStaffIds(
      supabase,
      staff.map((s) => s.id),
    );
    const explicitSchedules = await loadSchedulesForStaffIdsInRange(supabase, {
      staffIds: staff.map((s) => s.id),
      from: start,
      to: end,
    });
    const shopScheduling = await loadShopSchedulingFields(supabase, shopIdFilter);

    let monthRows = staff
      .map((s) => {
        const staffRows = punches.filter((p) => p.staff_id === s.id);
        const stats = monthStatsFromRows(staffRows, dim, `${yStr}-${mo}`);
        const issues = analyzeDayIssues(sortByEventTime(staffRows));
        const profile = scheduleMap.get(s.id);
        const explicitRaw = explicitSchedules.get(s.id);
        const explicit =
          explicitRaw && shopIdFilter
            ? new Map(
                [...explicitRaw.entries()].map(([day, rows]) => [
                  day,
                  (rows ?? []).filter((r) => r.shop_id === shopIdFilter),
                ]),
              )
            : explicitRaw;
        const hasExplicitSchedules = Boolean(explicit && explicit.size > 0);
        const shift_perf =
          profile || hasExplicitSchedules || shopScheduling
            ? buildMonthShiftPerformance(
                profile ?? { ...defaultStaffSchedule(), schedule_mode: "custom" },
                `${yStr}-${mo}`,
                dim,
                staffRows,
                explicit,
                shopScheduling,
                {
                  hasExplicitSchedules,
                  staffType: s.staff_type,
                },
              )
            : null;
        return {
          staff_id: s.id,
          staff_name: s.staff_name,
          staff_code: s.staff_code,
          staff_type: s.staff_type,
          position_name: positionNames.get(s.id) ?? null,
          staff_status: s.status,
          shops_label: shopNamesVisited(staffRows),
          has_punch: stats.present_days > 0,
          ...stats,
          issues,
          history: sortByEventTime(staffRows),
          shift_performance: shift_perf
            ? {
                ...shift_perf,
                actual_hours_label: formatDuration(shift_perf.actual_hours_ms),
                scheduled_hours_label: formatDuration(shift_perf.scheduled_hours_ms),
              }
            : null,
        };
      })
      .filter((row) =>
        staffPassesView(
          row.has_punch,
          view,
          undefined,
          row.shift_performance?.absent_count ?? 0,
        ),
      );

    if (view === "attendance") {
      monthRows = applyAttendanceFilters(monthRows, gpsFilter, issueFilter);
    }

    const summary =
      view === "attendance"
        ? buildReportSummary(monthRows)
        : { total_present_staff: monthRows.length, total_hours_ms: 0, total_hours_label: "0h 0m", missing_clock_out_count: 0, weak_indoor_count: 0, rejected_gps_count: 0, review_required_count: 0, gps_issues_count: 0 };

    return NextResponse.json({
      mode,
      view,
      payroll_mode,
      shop_id: shopIdFilter,
      include_inactive: includeInactive,
      gps_status: gpsFilter || null,
      issue_type: issueFilter || null,
      month: `${yStr}-${mo}`,
      days_in_month: dim,
      summary,
      rows: monthRows,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
