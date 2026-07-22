import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { getScheduleType, scheduleTypeToStatusCode } from "@/lib/shifts/schedule-type";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

/** Schedule cell status codes (not timed shifts). */
export const SCHEDULE_STATUS_CODES = ["NS", "RD", "MC", "AL", "UL", "EL"] as const;
export type ScheduleStatusCode = (typeof SCHEDULE_STATUS_CODES)[number];

/** Leave codes excluding NS and RD. */
export const SCHEDULE_LEAVE_CODES = ["RD", "MC", "AL", "UL", "EL"] as const;
export type ScheduleLeaveCode = (typeof SCHEDULE_LEAVE_CODES)[number];

/** Labels stored in schedule cells that mean rest/off day (not a timed shift). */
const OFF_DAY_LABELS = new Set([
  "rd",
  "off",
  "rest day",
  "off day",
  "rest_day",
  "off_day",
  "restday",
  "offday",
]);

const NOT_SCHEDULED_LABELS = new Set([
  "ns",
  "not scheduled",
  "not_scheduled",
  "notscheduled",
  "不排班",
]);

export type ScheduleNonWorkingStatus =
  | "not_scheduled"
  | "off_day"
  | "mc"
  | "al"
  | "ul"
  | "el";

/** True when value is a known schedule status code (NS, RD, MC, AL, UL, EL). */
export function isScheduleStatusCode(
  value: string | null | undefined,
): value is ScheduleStatusCode {
  if (!value) return false;
  return SCHEDULE_STATUS_CODES.includes(value.trim().toUpperCase() as ScheduleStatusCode);
}

/** @deprecated Use isScheduleStatusCode */
export function isScheduleLeaveCode(value: string | null | undefined): value is ScheduleLeaveCode {
  return isScheduleStatusCode(value) && value.trim().toUpperCase() !== "NS";
}

/** True when a raw schedule time field is a rest-day label (RD, OFF, etc.) — not leave codes. */
export function isOffDayScheduleLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!normalized) return false;
  if (normalized === "rd" || OFF_DAY_LABELS.has(normalized)) return true;
  return normalized === "r d" || normalized === "r.d.";
}

export function isNotScheduledScheduleLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  return normalized === "ns" || NOT_SCHEDULED_LABELS.has(normalized);
}

/** Resolve status code from raw schedule fields. */
export function resolveScheduleStatusCode(
  start: string | null | undefined,
  end: string | null | undefined,
  isOffDayFlag?: boolean,
): ScheduleStatusCode | null {
  const rawStart = start?.trim() ?? "";
  const rawEnd = end?.trim() ?? "";
  if (isScheduleStatusCode(rawStart)) return rawStart.toUpperCase() as ScheduleStatusCode;
  if (isScheduleStatusCode(rawEnd)) return rawEnd.toUpperCase() as ScheduleStatusCode;
  if (
    rawStart &&
    rawEnd &&
    rawStart.toLowerCase() === rawEnd.toLowerCase() &&
    isScheduleStatusCode(rawStart)
  ) {
    return rawStart.toUpperCase() as ScheduleStatusCode;
  }
  if (isNotScheduledScheduleLabel(rawStart) || isNotScheduledScheduleLabel(rawEnd)) {
    return "NS";
  }
  if (isOffDayScheduleLabel(rawStart) || isOffDayScheduleLabel(rawEnd) || isOffDayFlag === true) {
    return "RD";
  }
  return null;
}

/** @deprecated Use resolveScheduleStatusCode */
export function resolveScheduleLeaveCode(
  start: string | null | undefined,
  end: string | null | undefined,
  isOffDayFlag?: boolean,
): ScheduleLeaveCode | null {
  const code = resolveScheduleStatusCode(start, end, isOffDayFlag);
  if (!code || code === "NS") return null;
  return code as ScheduleLeaveCode;
}

export function getScheduleStatusCode(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time"> & {
    schedule_type?: StaffScheduleRow["schedule_type"];
  } | null | undefined,
): ScheduleStatusCode | null {
  if (!row) return null;
  const type = getScheduleType(row);
  if (type !== "SHIFT") return scheduleTypeToStatusCode(type);
  return resolveScheduleStatusCode(row.start_time, row.end_time, row.is_off_day);
}

/** @deprecated Use getScheduleStatusCode */
export function getScheduleLeaveCode(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time"> | null | undefined,
): ScheduleLeaveCode | null {
  const code = getScheduleStatusCode(row);
  if (!code || code === "NS") return null;
  return code as ScheduleLeaveCode;
}

/** Attendance report status for a schedule status code. */
export function attendanceStatusForStatusCode(code: ScheduleStatusCode): ScheduleNonWorkingStatus {
  switch (code) {
    case "NS":
      return "not_scheduled";
    case "RD":
      return "off_day";
    case "MC":
      return "mc";
    case "AL":
      return "al";
    case "UL":
      return "ul";
    case "EL":
      return "el";
  }
}

/** @deprecated Use attendanceStatusForStatusCode */
export function attendanceStatusForLeaveCode(code: ScheduleLeaveCode): ScheduleNonWorkingStatus {
  return attendanceStatusForStatusCode(code);
}

export function attendanceStatusForScheduleRow(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time">,
): ScheduleNonWorkingStatus | null {
  const code = getScheduleStatusCode(row);
  return code ? attendanceStatusForStatusCode(code) : null;
}

/** True when row is rest, leave, or NS — not a timed working shift. */
export function isStaffScheduleNonWorkingDay(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time"> & {
    schedule_type?: StaffScheduleRow["schedule_type"];
  } | null | undefined,
): boolean {
  return getScheduleType(row) !== "SHIFT";
}

/** @deprecated Use isStaffScheduleNonWorkingDay */
export function isStaffScheduleOffDay(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time"> | null | undefined,
): boolean {
  return isStaffScheduleNonWorkingDay(row);
}

/** True when row is an active timed working shift. */
export function isStaffScheduleWorkingShift(
  row:
    | (Pick<StaffScheduleRow, "status" | "is_off_day" | "start_time" | "end_time"> & {
        schedule_type?: StaffScheduleRow["schedule_type"];
      })
    | null
    | undefined,
): boolean {
  if (!row || row.status !== "active") return false;
  if (getScheduleType(row) !== "SHIFT") return false;
  return Boolean(row.start_time?.trim() && row.end_time?.trim());
}

/** True when attendance date is after today (Malaysia). */
/** Statuses excluded from absent, missed-shift, late, and reliability penalties. */
export const ATTENDANCE_PENALTY_EXEMPT_STATUSES = new Set([
  "not_scheduled",
  "off_day",
  "mc",
  "al",
  "ul",
  "el",
  "upcoming",
]);

export function isAttendancePenaltyExemptStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ATTENDANCE_PENALTY_EXEMPT_STATUSES.has(status);
}

export function isFutureAttendanceDay(ymd: string): boolean {
  return ymd > malaysiaDateYmd(new Date());
}

/** Pick the active non-working schedule (NS / RD / leave) for a staff day, if any. */
export function pickNonWorkingScheduleForDay(
  schedules: StaffScheduleRow[],
  shopIdFilter?: string | null,
): StaffScheduleRow | null {
  let candidates = (schedules ?? []).filter(
    (s) => s.status === "active" && isStaffScheduleNonWorkingDay(s),
  );
  if (shopIdFilter) {
    const atShop = candidates.filter((s) => s.shop_id === shopIdFilter);
    if (atShop.length > 0) candidates = atShop;
  }
  return candidates[0] ?? null;
}

/** @deprecated Use pickNonWorkingScheduleForDay */
export function pickOffDayScheduleForDay(
  schedules: StaffScheduleRow[],
  shopIdFilter?: string | null,
): StaffScheduleRow | null {
  return pickNonWorkingScheduleForDay(schedules, shopIdFilter);
}

/** Display label for schedule grid / reports. */
export function offDayScheduleDisplayLabel(
  row: Pick<StaffScheduleRow, "is_off_day" | "start_time" | "end_time"> & {
    schedule_type?: StaffScheduleRow["schedule_type"];
  },
): string {
  const type = getScheduleType(row);
  if (type !== "SHIFT") {
    const code = scheduleTypeToStatusCode(type);
    return code ?? type;
  }
  if (row.start_time?.trim()) return row.start_time.trim();
  return "RD";
}
