import { matchesEventDate } from "@/lib/attendance-db";
import { shopSchedulingFromRow, type ShopSchedulingFields } from "@/lib/shop-scheduling";
import { matchAttendanceToScheduledShift, type ShiftMatchResult } from "@/lib/shifts/shift-match";
import { matchMultiShiftDay, type MultiShiftDayResult } from "@/lib/shifts/multi-shift-match";
import {
  pickAllWorkingSchedulesForDay,
  pickPrimaryScheduleForDay,
} from "@/lib/shifts/schedule-attendance-match";
import {
  attendanceStatusForScheduleRow,
  isStaffScheduleNonWorkingDay,
  isStaffScheduleWorkingShift,
  pickNonWorkingScheduleForDay,
} from "@/lib/shifts/schedule-off-day";
import type { AttendanceRecord } from "@/lib/attendance";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type ResolvedStaffSchedule = {
  scheduled_start: string | null;
  scheduled_end: string | null;
  break_minutes: number;
  is_off_day: boolean;
  source: "shop_fixed" | "staff_shift" | "none";
};

function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s.length >= 5 ? s.slice(0, 5) : null;
}

export function resolveScheduleFromShop(
  shopRow: Record<string, unknown>,
): ResolvedStaffSchedule {
  const shop = shopSchedulingFromRow(shopRow);
  return {
    scheduled_start: shop.opening_time,
    scheduled_end: shop.closing_time,
    break_minutes: shop.break_minutes,
    is_off_day: false,
    source: "shop_fixed",
  };
}

export function resolveScheduleFromStaffRow(
  row: StaffScheduleRow | null | undefined,
): ResolvedStaffSchedule {
  if (!row || row.status !== "active") {
    return { scheduled_start: null, scheduled_end: null, break_minutes: 0, is_off_day: false, source: "none" };
  }
  if (isStaffScheduleNonWorkingDay(row)) {
    return { scheduled_start: null, scheduled_end: null, break_minutes: 0, is_off_day: true, source: "staff_shift" };
  }
  return {
    scheduled_start: hhmm(row.start_time),
    scheduled_end: hhmm(row.end_time),
    break_minutes: row.break_minutes ?? 0,
    is_off_day: false,
    source: "staff_shift",
  };
}

export function resolveStaffDaySchedule(
  shop: ShopSchedulingFields,
  explicitRow: StaffScheduleRow | null | undefined,
): ResolvedStaffSchedule {
  if (shop.work_time_mode === "fixed") {
    return {
      scheduled_start: shop.opening_time,
      scheduled_end: shop.closing_time,
      break_minutes: shop.break_minutes,
      is_off_day: false,
      source: "shop_fixed",
    };
  }
  return resolveScheduleFromStaffRow(explicitRow);
}

export function matchStaffDayWithShopSchedule(params: {
  ymd: string;
  shop: ShopSchedulingFields | null;
  explicitRow: StaffScheduleRow | null | undefined;
  explicitRows?: StaffScheduleRow[];
  /** Full schedule list for the day (all shops) — used when explicitRows is shop-filtered. */
  allSchedulesForDay?: StaffScheduleRow[];
  history: AttendanceRecord[];
  shopIdFilter?: string | null;
}): ShiftMatchResult | MultiShiftDayResult {
  const dayRows = params.history.filter((r) => matchesEventDate(r, params.ymd));
  const allForDay =
    params.allSchedulesForDay ??
    params.explicitRows ??
    (params.explicitRow ? [params.explicitRow] : []);

  if (params.shop?.work_time_mode === "fixed") {
    return matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: params.shop.opening_time,
      scheduledEnd: params.shop.closing_time,
      breakMinutes: params.shop.break_minutes,
      history: params.history,
    });
  }

  // Rest/leave day (RD, MC, AL, UL, EL) — never treat as absent missed shift.
  const nonWorkingRow = pickNonWorkingScheduleForDay(allForDay, params.shopIdFilter ?? null);
  if (nonWorkingRow) {
    const leaveStatus = attendanceStatusForScheduleRow(nonWorkingRow);
    return matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: null,
      scheduledEnd: null,
      breakMinutes: 0,
      scheduleLeaveStatus: leaveStatus,
      history: params.history,
    });
  }

  const workingShifts = pickAllWorkingSchedulesForDay({
    schedules: allForDay,
    shopIdFilter: params.shopIdFilter ?? null,
  });

  if (workingShifts.length > 1) {
    return matchMultiShiftDay({
      ymd: params.ymd,
      schedules: workingShifts,
      history: params.history,
      shopIdFilter: params.shopIdFilter ?? null,
    });
  }

  const explicit =
    workingShifts[0] ??
    pickPrimaryScheduleForDay({
      schedules: allForDay,
      dayRows,
      shopIdFilter: params.shopIdFilter ?? null,
    }) ??
    params.explicitRow;

  const resolved = params.shop
    ? resolveStaffDaySchedule(params.shop, explicit)
    : resolveScheduleFromStaffRow(explicit);

  // Scheduled shift exists for this shop/day — never treat as unscheduled.
  if (
    resolved.source === "none" &&
    dayRows.length > 0 &&
    pickPrimaryScheduleForDay({
      schedules: allForDay,
      dayRows,
      shopIdFilter: params.shopIdFilter ?? null,
    })
  ) {
    const fallback = pickPrimaryScheduleForDay({
      schedules: allForDay,
      dayRows,
      shopIdFilter: params.shopIdFilter ?? null,
    })!;
    return matchAttendanceToScheduledShift({
      ymd: params.ymd,
      scheduledStart: fallback.start_time,
      scheduledEnd: fallback.end_time,
      breakMinutes: fallback.break_minutes,
      history: params.history,
    });
  }

  return matchAttendanceToScheduledShift({
    ymd: params.ymd,
    scheduledStart: resolved.scheduled_start,
    scheduledEnd: resolved.scheduled_end,
    breakMinutes: resolved.break_minutes,
    isOffDay: resolved.is_off_day,
    history: params.history,
  });
}
