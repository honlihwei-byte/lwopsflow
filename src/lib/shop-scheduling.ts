/** Shop operating hours and work-time mode (fixed vs shift-based). */

export type WorkTimeMode = "fixed" | "shift_based";

export type ShopSchedulingFields = {
  work_time_mode: WorkTimeMode;
  opening_time: string;
  closing_time: string;
  break_minutes: number;
};

export const DEFAULT_SHOP_SCHEDULING: ShopSchedulingFields = {
  work_time_mode: "fixed",
  opening_time: "10:00",
  closing_time: "21:00",
  break_minutes: 60,
};

export const WORK_TIME_MODE_LABELS: Record<WorkTimeMode, string> = {
  fixed: "Fixed working time",
  shift_based: "Shift based",
};

export const DEFAULT_SHIFT_TEMPLATES = [
  { name: "Morning", start_time: "10:00", end_time: "18:00", break_minutes: 60 },
  { name: "Noon", start_time: "12:30", end_time: "21:00", break_minutes: 60 },
  { name: "Full", start_time: "10:00", end_time: "21:00", break_minutes: 60 },
  { name: "Part time", start_time: "11:00", end_time: "14:00", break_minutes: 0 },
] as const;

function hhmm(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(s)) return fallback;
  return s.slice(0, 5);
}

export function parseWorkTimeMode(v: unknown): WorkTimeMode {
  return v === "shift_based" ? "shift_based" : "fixed";
}

export function parseBreakMinutes(v: unknown, fallback = 60): number {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(600, Math.round(n));
}

export function shopSchedulingFromRow(row: Record<string, unknown>): ShopSchedulingFields {
  return {
    work_time_mode: parseWorkTimeMode(row.work_time_mode),
    opening_time: hhmm(row.opening_time, DEFAULT_SHOP_SCHEDULING.opening_time),
    closing_time: hhmm(row.closing_time, DEFAULT_SHOP_SCHEDULING.closing_time),
    break_minutes: parseBreakMinutes(row.break_minutes, DEFAULT_SHOP_SCHEDULING.break_minutes),
  };
}

export function shopSchedulingFromBody(body: Record<string, unknown>): ShopSchedulingFields {
  return {
    work_time_mode: parseWorkTimeMode(body.work_time_mode),
    opening_time: hhmm(body.opening_time, DEFAULT_SHOP_SCHEDULING.opening_time),
    closing_time: hhmm(body.closing_time, DEFAULT_SHOP_SCHEDULING.closing_time),
    break_minutes: parseBreakMinutes(body.break_minutes),
  };
}

export const SHOP_SCHEDULING_SELECT =
  "work_time_mode, opening_time, closing_time, break_minutes" as const;

export const SHOP_FULL_SELECT =
  "id, name, gps_indoor_mode, allow_photo_proof_fallback, latitude, longitude, allowed_radius_meters, punch_qr_token, work_time_mode, opening_time, closing_time, break_minutes, attendance_verification_mode, anti_buddy_detect_new_device, anti_buddy_detect_device_mismatch, anti_buddy_detect_shared_device, anti_buddy_flag_rapid_punches, anti_buddy_require_review_high_risk, selfie_proof_mode, selfie_proof_random_percent, device_enforcement_mode, created_at, updated_at" as const;
