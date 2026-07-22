import { fetchAttendanceForDay } from "@/lib/attendance-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  getStaffAssignedShopIds,
  getStaffPermissionScopeShopIds,
  loadStaffPermissionProfile,
} from "@/lib/permissions/staff-permissions-db";
import { isScheduleStatusCode } from "@/lib/shifts/schedule-off-day";
import { isWorkingShiftScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { parseWorkTimeMode, type WorkTimeMode } from "@/lib/shop-scheduling";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type EmployeeClockShopLabel = "scheduled_today" | "assigned" | "access_scope";

export type EmployeeOpenSession = {
  shop_id: string;
  shop_name: string;
  clock_in_time: string;
};

export type EmployeeClockShopOption = {
  id: string;
  name: string;
  work_time_mode: WorkTimeMode;
  labels: EmployeeClockShopLabel[];
  scheduled_today: boolean;
  is_assigned: boolean;
  has_open_session: boolean;
  can_clock_in: boolean;
  block_reason: "not_accessible" | "no_schedule_today" | null;
};

export type EmployeeClockShopAccess = {
  today: string;
  allow_unscheduled_clock_in: boolean;
  accessible_shops: EmployeeClockShopOption[];
  open_sessions: EmployeeOpenSession[];
  assigned_shops: Array<{ id: string; name: string }>;
  scheduled_shifts_today: Array<{
    shop_id: string;
    shop_name: string;
    start_time: string;
    end_time: string;
    is_off_day: boolean;
  }>;
  schedule_lookup_warning?: string | null;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function loadCompanyAllowUnscheduledClockIn(
  supabase: Supabase,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("companies")
    .select("allow_unscheduled_clock_in")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    console.warn("[employee-clock] allow_unscheduled_clock_in lookup failed", error.message);
    return true;
  }
  if (data?.allow_unscheduled_clock_in === false) return false;
  return true;
}

async function resolveScopeShopIds(
  supabase: Supabase,
  params: { staff_id: string; company_id: string },
): Promise<string[]> {
  const profile = await loadStaffPermissionProfile(supabase, params.staff_id);
  if (!profile) return [];

  if (profile.shop_scope === "all_shops") {
    const { data, error } = await supabase
      .from("shops")
      .select("id")
      .eq("company_id", params.company_id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => String(r.id));
  }

  if (profile.shop_scope === "selected_shops") {
    return getStaffPermissionScopeShopIds(supabase, params.staff_id);
  }

  return [];
}

function buildOpenSessions(
  rows: Awaited<ReturnType<typeof fetchAttendanceForDay>>,
  staffId: string,
): EmployeeOpenSession[] {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.staff_id !== staffId) continue;
    const list = grouped.get(row.shop_id) ?? [];
    list.push(row);
    grouped.set(row.shop_id, list);
  }

  const open: EmployeeOpenSession[] = [];
  for (const [shopId, shopRows] of grouped) {
    const sorted = [...shopRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const last = sorted[sorted.length - 1];
    if (last?.action_type === "clock_in") {
      open.push({
        shop_id: shopId,
        shop_name: last.shop_name,
        clock_in_time: last.event_time ?? last.created_at,
      });
    }
  }

  return open.sort((a, b) => a.shop_name.localeCompare(b.shop_name));
}

export async function loadEmployeeClockShopAccess(
  supabase: Supabase,
  params: { staff_id: string; company_id: string },
): Promise<EmployeeClockShopAccess> {
  const today = malaysiaDateYmd(new Date());

  const [assignedIds, scopeIds, allowUnscheduled, scheduleRes] = await Promise.all([
    getStaffAssignedShopIds(supabase, params.staff_id),
    resolveScopeShopIds(supabase, params),
    loadCompanyAllowUnscheduledClockIn(supabase, params.company_id),
    supabase
      .from("staff_schedules")
      .select("shop_id, start_time, end_time, is_off_day, shops(name)")
      .eq("staff_id", params.staff_id)
      .eq("company_id", params.company_id)
      .eq("shift_date", today)
      .eq("status", "active")
      .order("start_time", { ascending: true }),
  ]);

  let scheduleLookupWarning: string | null = null;
  if (scheduleRes.error) {
    scheduleLookupWarning = scheduleRes.error.message;
    console.warn("[employee-clock] schedule lookup failed", scheduleRes.error.message);
  }

  const scheduledShiftsToday = (scheduleRes.data ?? [])
    .filter((row) => isWorkingShiftScheduleRow(row))
    .map((row) => {
      const shopJoin = row.shops as { name?: string } | null;
      const start = String(row.start_time ?? "").trim();
      const end = String(row.end_time ?? "").trim();
      if (isScheduleStatusCode(start) || isScheduleStatusCode(end)) {
        return null;
      }
      return {
        shop_id: String(row.shop_id),
        shop_name: String(shopJoin?.name ?? ""),
        start_time: start,
        end_time: end,
        is_off_day: false,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const scheduledShopIds = scheduledShiftsToday.map((s) => s.shop_id);

  const accessibleIds = uniqueIds([...assignedIds, ...scheduledShopIds, ...scopeIds]);

  let shopRows: Array<{ id: string; name: string; work_time_mode: string | null }> = [];
  if (accessibleIds.length > 0) {
    const { data, error } = await supabase
      .from("shops")
      .select("id, name, work_time_mode")
      .in("id", accessibleIds)
      .eq("company_id", params.company_id)
      .order("name");
    if (error) throw new Error(error.message);
    shopRows = (data ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name),
      work_time_mode: s.work_time_mode != null ? String(s.work_time_mode) : null,
    }));
  }

  const assignedSet = new Set(assignedIds);
  const scheduledSet = new Set(scheduledShopIds);
  const scopeSet = new Set(scopeIds);

  const attendanceRows =
    accessibleIds.length > 0
      ? (
          await fetchAttendanceForDay(supabase, today, null, accessibleIds)
        ).filter((r) => r.staff_id === params.staff_id)
      : [];

  const openSessions = buildOpenSessions(attendanceRows, params.staff_id);
  const openSessionShopIds = new Set(openSessions.map((s) => s.shop_id));

  const assignedShops = shopRows
    .filter((s) => assignedSet.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  const accessibleShops: EmployeeClockShopOption[] = shopRows.map((shop) => {
    const workTimeMode = parseWorkTimeMode(shop.work_time_mode);
    const isAssigned = assignedSet.has(shop.id);
    const scheduledToday = scheduledSet.has(shop.id);
    const inScope = scopeSet.has(shop.id) && !isAssigned && !scheduledToday;

    const labels: EmployeeClockShopLabel[] = [];
    if (scheduledToday) labels.push("scheduled_today");
    if (isAssigned) labels.push("assigned");
    if (inScope) labels.push("access_scope");

    let canClockIn = false;
    let blockReason: EmployeeClockShopOption["block_reason"] = null;

    if (scheduledToday) {
      canClockIn = true;
    } else if (workTimeMode === "fixed") {
      canClockIn = true;
    } else if (allowUnscheduled) {
      canClockIn = true;
    } else {
      canClockIn = false;
      blockReason = "no_schedule_today";
    }

    return {
      id: shop.id,
      name: shop.name,
      work_time_mode: workTimeMode,
      labels,
      scheduled_today: scheduledToday,
      is_assigned: isAssigned,
      has_open_session: openSessionShopIds.has(shop.id),
      can_clock_in: canClockIn,
      block_reason: blockReason,
    };
  });

  accessibleShops.sort((a, b) => {
    if (a.scheduled_today !== b.scheduled_today) return a.scheduled_today ? -1 : 1;
    if (a.has_open_session !== b.has_open_session) return a.has_open_session ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    today,
    allow_unscheduled_clock_in: allowUnscheduled,
    accessible_shops: accessibleShops,
    open_sessions: openSessions,
    assigned_shops: assignedShops,
    scheduled_shifts_today: scheduledShiftsToday,
    schedule_lookup_warning: scheduleLookupWarning,
  };
}

export async function isEmployeeClockShopAccessible(
  supabase: Supabase,
  params: { staff_id: string; company_id: string; shop_id: string },
): Promise<EmployeeClockShopOption | null> {
  const access = await loadEmployeeClockShopAccess(supabase, params);
  return access.accessible_shops.find((s) => s.id === params.shop_id) ?? null;
}

export async function assertEmployeeCanClockInAtShop(
  supabase: Supabase,
  params: { staff_id: string; company_id: string; shop_id: string },
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  try {
    const shop = await isEmployeeClockShopAccessible(supabase, params);
    if (!shop) {
      return {
        ok: false,
        error: "You are not allowed to clock in at this shop.",
        code: "shop_not_accessible",
      };
    }
    if (!shop.can_clock_in) {
      return {
        ok: false,
        error: "No schedule found for this shop today.",
        code: "no_schedule_today",
      };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[employee-clock] schedule access check failed — allowing punch", e);
    return { ok: true };
  }
}
