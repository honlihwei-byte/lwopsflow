import {
  loadEmployeeClockShopAccess,
  type EmployeeClockShopOption,
  type EmployeeOpenSession,
} from "@/lib/employee-clock-shop-access";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type ClockContextResolution =
  | "scheduled"
  | "single_shop"
  | "pick_shop"
  | "open_session"
  | "none";

export type EmployeeClockContext = {
  resolution: ClockContextResolution;
  today: string;
  allow_unscheduled_clock_in: boolean;
  accessible_shops: EmployeeClockShopOption[];
  open_sessions: EmployeeOpenSession[];
  /** @deprecated use accessible_shops — kept for backward compatibility */
  assigned_shops: Array<{ id: string; name: string }>;
  /** @deprecated use scheduled_shifts_today[0] */
  scheduled_shift: {
    shop_id: string;
    shop_name: string;
    start_time: string;
    end_time: string;
    is_off_day: boolean;
  } | null;
  scheduled_shifts_today: Array<{
    shop_id: string;
    shop_name: string;
    start_time: string;
    end_time: string;
    is_off_day: boolean;
  }>;
  selected_shop_id: string | null;
  suggested_shop_id: string | null;
  can_clock: boolean;
  block_message: string | null;
  selected_shop_block_reason: EmployeeClockShopOption["block_reason"];
  schedule_lookup_warning?: string | null;
};

function pickSuggestedShop(
  shops: EmployeeClockShopOption[],
  openSessions: EmployeeOpenSession[],
  requestedShopId: string | null,
): string | null {
  if (requestedShopId && shops.some((s) => s.id === requestedShopId)) {
    return requestedShopId;
  }
  if (openSessions.length === 1) return openSessions[0]!.shop_id;
  const scheduled = shops.find((s) => s.scheduled_today);
  if (scheduled) return scheduled.id;
  if (shops.length === 1) return shops[0]!.id;
  return null;
}

function resolutionFor(
  shops: EmployeeClockShopOption[],
  openSessions: EmployeeOpenSession[],
  selectedShopId: string | null,
): ClockContextResolution {
  if (shops.length === 0) return "none";
  if (openSessions.length > 1 && !selectedShopId) return "pick_shop";
  if (openSessions.length === 1 && !selectedShopId) return "open_session";
  if (shops.some((s) => s.scheduled_today) && selectedShopId) return "scheduled";
  if (shops.length === 1) return "single_shop";
  if (!selectedShopId) return "pick_shop";
  return "pick_shop";
}

export async function resolveEmployeeClockContext(
  supabase: Supabase,
  params: { staff_id: string; company_id: string; requested_shop_id?: string | null },
): Promise<EmployeeClockContext> {
  const access = await loadEmployeeClockShopAccess(supabase, params);
  const { accessible_shops, open_sessions, assigned_shops, scheduled_shifts_today } = access;

  const scheduledShift =
    scheduled_shifts_today.find((s) => !s.is_off_day) ?? scheduled_shifts_today[0] ?? null;

  if (accessible_shops.length === 0) {
    return {
      resolution: "none",
      today: access.today,
      allow_unscheduled_clock_in: access.allow_unscheduled_clock_in,
      accessible_shops: [],
      open_sessions: [],
      assigned_shops: [],
      scheduled_shift: scheduledShift,
      scheduled_shifts_today,
      selected_shop_id: null,
      suggested_shop_id: null,
      can_clock: false,
      block_message: "no_shop_assigned",
      selected_shop_block_reason: null,
      schedule_lookup_warning: access.schedule_lookup_warning ?? null,
    };
  }

  const suggestedShopId = pickSuggestedShop(
    accessible_shops,
    open_sessions,
    params.requested_shop_id ?? null,
  );
  const selectedShopId = params.requested_shop_id ?? suggestedShopId;
  const selectedShop = selectedShopId
    ? accessible_shops.find((s) => s.id === selectedShopId) ?? null
    : null;

  if (params.requested_shop_id && !selectedShop) {
    return {
      resolution: "none",
      today: access.today,
      allow_unscheduled_clock_in: access.allow_unscheduled_clock_in,
      accessible_shops,
      open_sessions,
      assigned_shops,
      scheduled_shift: scheduledShift,
      scheduled_shifts_today,
      selected_shop_id: null,
      suggested_shop_id: suggestedShopId,
      can_clock: false,
      block_message: "shop_not_accessible",
      selected_shop_block_reason: "not_accessible",
      schedule_lookup_warning: access.schedule_lookup_warning ?? null,
    };
  }

  const canClockAtSelected =
    selectedShop != null &&
    (selectedShop.can_clock_in || selectedShop.has_open_session);

  let blockMessage: string | null = null;
  if (selectedShop && !canClockAtSelected) {
    blockMessage =
      selectedShop.block_reason === "no_schedule_today"
        ? "no_schedule_today"
        : "shop_not_accessible";
  }

  return {
    resolution: resolutionFor(accessible_shops, open_sessions, selectedShopId),
    today: access.today,
    allow_unscheduled_clock_in: access.allow_unscheduled_clock_in,
    accessible_shops,
    open_sessions,
    assigned_shops,
    scheduled_shift: scheduledShift,
    scheduled_shifts_today,
    selected_shop_id: selectedShopId,
    suggested_shop_id: suggestedShopId,
    can_clock: selectedShopId ? canClockAtSelected : accessible_shops.some((s) => s.can_clock_in),
    block_message: blockMessage,
    selected_shop_block_reason: selectedShop?.block_reason ?? null,
    schedule_lookup_warning: access.schedule_lookup_warning ?? null,
  };
}
