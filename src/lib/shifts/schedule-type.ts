import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import {
  isScheduleStatusCode,
  resolveScheduleStatusCode,
  type ScheduleStatusCode,
} from "@/lib/shifts/schedule-off-day";

export const SCHEDULE_TYPES = [
  "SHIFT",
  "RD",
  "MC",
  "AL",
  "UL",
  "EL",
  "NOT_SCHEDULED",
] as const;

export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export function scheduleTypeFromStatusCode(code: string): ScheduleType {
  const upper = code.trim().toUpperCase();
  if (upper === "NS") return "NOT_SCHEDULED";
  if (SCHEDULE_TYPES.includes(upper as ScheduleType)) return upper as ScheduleType;
  return "SHIFT";
}

export function scheduleTypeToStatusCode(type: ScheduleType): ScheduleStatusCode | null {
  if (type === "SHIFT") return null;
  if (type === "NOT_SCHEDULED") return "NS";
  return type as ScheduleStatusCode;
}

export type ScheduleTypeRow = Pick<
  StaffScheduleRow,
  "is_off_day" | "start_time" | "end_time"
> & {
  schedule_type?: ScheduleType;
};

export function getScheduleType(row: ScheduleTypeRow | null | undefined): ScheduleType {
  if (!row) return "SHIFT";
  const raw = row.schedule_type != null ? String(row.schedule_type).trim().toUpperCase() : "";
  const fromColumn: ScheduleType | "" =
    raw === "NS"
      ? "NOT_SCHEDULED"
      : raw === "SHIFT" ||
          raw === "RD" ||
          raw === "MC" ||
          raw === "AL" ||
          raw === "UL" ||
          raw === "EL" ||
          raw === "NOT_SCHEDULED"
        ? (raw as ScheduleType)
        : "";
  if (fromColumn) {
    if (fromColumn === "SHIFT") {
      const hasTimes = Boolean(row.start_time?.trim() && row.end_time?.trim());
      if (!hasTimes) return "NOT_SCHEDULED";
    }
    return fromColumn;
  }
  // IMPORTANT: do not call getScheduleStatusCode() here — it calls getScheduleType()
  // and would recurse infinitely when schedule_type is missing (legacy / optimistic rows).
  const legacy = resolveScheduleStatusCode(row.start_time, row.end_time, row.is_off_day);
  if (!legacy) {
    return row.start_time?.trim() && row.end_time?.trim() ? "SHIFT" : "NOT_SCHEDULED";
  }
  return scheduleTypeFromStatusCode(legacy);
}

export function isShiftScheduleType(type: ScheduleType): boolean {
  return type === "SHIFT";
}

export function isNonShiftScheduleType(type: ScheduleType): boolean {
  return type !== "SHIFT";
}

export function resolveScheduleTypeFromApi(params: {
  leave_code?: string | null;
  is_off_day?: boolean;
  schedule_type?: string | null;
}): ScheduleType {
  if (params.schedule_type && SCHEDULE_TYPES.includes(params.schedule_type as ScheduleType)) {
    return params.schedule_type as ScheduleType;
  }
  const code = String(params.leave_code ?? "").trim().toUpperCase();
  if (isScheduleStatusCode(code)) return scheduleTypeFromStatusCode(code);
  if (params.is_off_day === true) return "RD";
  return "SHIFT";
}
