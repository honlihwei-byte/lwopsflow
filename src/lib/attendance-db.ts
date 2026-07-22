import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import type { AttendanceRecord } from "@/lib/attendance";
import {
  formatEventDateDisplay,
  formatEventTimeDisplay,
  malaysiaDateYmd,
  malaysiaDayUtcBounds,
  parseMalaysiaEventInstant,
} from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

/** Columns that exist on legacy and current Supabase attendance tables. */
export const ATTENDANCE_SELECT =
  "id, shop_id, shop_name, staff_id, staff_name, staff_code, staff_type, action_type, event_date, event_time, staff_latitude, staff_longitude, distance_from_shop_meters, gps_accuracy_meters, gps_verified, gps_verify_tier, gps_review_required, gps_indoor_fallback_used, gps_radius_used_meters, gps_confidence_label, gps_verify_attempt, gps_result_reason, location_confidence_score, photo_proof_used, photo_proof_path, photo_proof_uploaded_at, photo_proof_original_file_size, photo_proof_compressed_file_size, photo_proof_upload_duration_ms, selfie_proof_used, selfie_proof_path, selfie_captured_at, selfie_upload_status, verification_method, review_required, missing_rest_in, needs_review, exception_type, audit_notes, client_device_time, punch_device_id, device_fingerprint, punch_device_name, punch_browser_info, punch_browser, punch_platform, punch_user_agent, risk_score, risk_level, device_trust_status, buddy_punch_flag, risk_flags, created_at";

/** Minimal columns returned after clock punch (faster insert). */
export const ATTENDANCE_PUNCH_SELECT = "id, event_time, created_at, gps_verified, distance_from_shop_meters";

/** Fast verified punch — id + display time only. */
export const ATTENDANCE_FAST_PUNCH_SELECT = "id, event_time, created_at";

/** Malaysia calendar date for display (prefers stored event_date). */
export function recordEventDate(
  row: Pick<AttendanceRecord, "event_date" | "created_at">,
): string {
  return formatEventDateDisplay(row.event_date, row.created_at);
}

/** Malaysia HH:mm:ss for display (prefers stored event_time, not approval created_at). */
export function recordEventTime(row: Pick<AttendanceRecord, "event_time" | "created_at">): string {
  const hasWallTime = Boolean(row.event_time?.trim());
  return formatEventTimeDisplay(row.event_time, hasWallTime ? null : row.created_at);
}

/** Instant for pairing / hours math (event_date + event_time in Malaysia). */
export function recordEventInstant(
  row: Pick<AttendanceRecord, "event_date" | "event_time" | "created_at">,
): number {
  const fromWall = parseMalaysiaEventInstant(row.event_date, row.event_time);
  if (fromWall != null) return fromWall;
  const d = new Date(row.created_at);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function normalizeAttendanceRecord(row: Record<string, unknown>): AttendanceRecord {
  const created_at = String(row.created_at ?? new Date().toISOString());
  const instant = new Date(created_at);
  const derived = buildAttendanceEventFields(instant);
  const event_time = formatEventTimeDisplay(
    row.event_time != null ? String(row.event_time) : null,
    created_at,
  );

  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    shop_name: String(row.shop_name),
    staff_id: String(row.staff_id),
    staff_name: String(row.staff_name),
    staff_code: String(row.staff_code),
    staff_type: String(row.staff_type),
    action_type: row.action_type as AttendanceRecord["action_type"],
    event_date:
      row.event_date != null && String(row.event_date).trim()
        ? formatEventDateDisplay(String(row.event_date), null)
        : malaysiaDateYmd(instant),
    event_time: event_time === "—" ? derived.event_time : event_time,
    staff_latitude: row.staff_latitude as number | null | undefined,
    staff_longitude: row.staff_longitude as number | null | undefined,
    distance_from_shop_meters: row.distance_from_shop_meters as number | null | undefined,
    gps_accuracy_meters: row.gps_accuracy_meters as number | null | undefined,
    gps_verified: row.gps_verified as boolean | null | undefined,
    gps_verify_tier: row.gps_verify_tier as string | null | undefined,
    gps_review_required: row.gps_review_required as boolean | null | undefined,
    location_confidence_score:
      typeof row.location_confidence_score === "number"
        ? row.location_confidence_score
        : null,
    gps_indoor_fallback_used: row.gps_indoor_fallback_used as boolean | null | undefined,
    gps_radius_used_meters: row.gps_radius_used_meters as number | null | undefined,
    gps_confidence_label: row.gps_confidence_label as string | null | undefined,
    gps_verify_attempt:
      typeof row.gps_verify_attempt === "number" ? row.gps_verify_attempt : null,
    gps_result_reason: row.gps_result_reason as string | null | undefined,
    photo_proof_used: row.photo_proof_used as boolean | null | undefined,
    photo_proof_path: row.photo_proof_path as string | null | undefined,
    photo_proof_uploaded_at: row.photo_proof_uploaded_at as string | null | undefined,
    photo_proof_original_file_size:
      typeof row.photo_proof_original_file_size === "number"
        ? row.photo_proof_original_file_size
        : null,
    photo_proof_compressed_file_size:
      typeof row.photo_proof_compressed_file_size === "number"
        ? row.photo_proof_compressed_file_size
        : null,
    photo_proof_upload_duration_ms:
      typeof row.photo_proof_upload_duration_ms === "number"
        ? row.photo_proof_upload_duration_ms
        : null,
    selfie_proof_used: row.selfie_proof_used === true,
    selfie_proof_path:
      typeof row.selfie_proof_path === "string" && row.selfie_proof_path.trim()
        ? row.selfie_proof_path.trim()
        : null,
    selfie_captured_at:
      typeof row.selfie_captured_at === "string" && row.selfie_captured_at.trim()
        ? row.selfie_captured_at.trim()
        : null,
    selfie_upload_status:
      row.selfie_upload_status === "pending" ||
      row.selfie_upload_status === "uploaded" ||
      row.selfie_upload_status === "failed" ||
      row.selfie_upload_status === "not_required"
        ? row.selfie_upload_status
        : row.selfie_upload_status === "none"
          ? "none"
          : null,
    verification_method: row.verification_method as string | null | undefined,
    audit_notes:
      typeof row.audit_notes === "string" && row.audit_notes.trim()
        ? row.audit_notes.trim()
        : null,
    review_required: row.review_required as boolean | null | undefined,
    missing_rest_in: row.missing_rest_in === true,
    needs_review: row.needs_review === true,
    exception_type:
      typeof row.exception_type === "string" && row.exception_type.trim()
        ? row.exception_type.trim()
        : null,
    client_device_time: row.client_device_time as string | null | undefined,
    punch_device_id: row.punch_device_id as string | null | undefined,
    device_fingerprint: row.device_fingerprint as string | null | undefined,
    punch_device_name: row.punch_device_name as string | null | undefined,
    punch_browser_info: row.punch_browser_info as string | null | undefined,
    punch_browser: row.punch_browser as string | null | undefined,
    punch_platform: row.punch_platform as string | null | undefined,
    punch_user_agent: row.punch_user_agent as string | null | undefined,
    risk_score: typeof row.risk_score === "number" ? row.risk_score : 0,
    risk_level: (row.risk_level as AttendanceRecord["risk_level"]) ?? "low",
    device_trust_status: row.device_trust_status as AttendanceRecord["device_trust_status"],
    buddy_punch_flag: row.buddy_punch_flag as boolean | null | undefined,
    risk_flags: Array.isArray(row.risk_flags)
      ? (row.risk_flags as string[])
      : typeof row.risk_flags === "string"
        ? (() => {
            try {
              return JSON.parse(row.risk_flags) as string[];
            } catch {
              return [];
            }
          })()
        : [],
    created_at,
  };
}

export function matchesEventDate(
  row: Pick<AttendanceRecord, "event_date" | "created_at">,
  ymd: string,
): boolean {
  return recordEventDate(row) === ymd;
}

export function isEventDateInRange(
  row: Pick<AttendanceRecord, "event_date" | "created_at">,
  fromYmd: string,
  toYmd: string,
): boolean {
  const d = recordEventDate(row);
  return d >= fromYmd && d <= toYmd;
}

function mapRows(data: Record<string, unknown>[] | null): AttendanceRecord[] {
  return (data ?? []).map((row) => normalizeAttendanceRecord(row));
}

/** Load attendance for one Malaysia calendar day. */
function applyShopScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  shopId: string | null,
  companyShopIds: string[] | null | undefined,
) {
  if (shopId) return q.eq("shop_id", shopId);
  if (companyShopIds && companyShopIds.length > 0) return q.in("shop_id", companyShopIds);
  return q;
}

export async function fetchAttendanceForDay(
  supabase: Supabase,
  date: string,
  shopId: string | null,
  companyShopIds?: string[] | null,
): Promise<AttendanceRecord[]> {
  let q = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .eq("event_date", date)
    .order("created_at", { ascending: true });
  q = applyShopScope(q, shopId, companyShopIds);

  const { data, error } = await q;
  if (!error) {
    return mapRows(data as Record<string, unknown>[] | null).filter((r) => matchesEventDate(r, date));
  }

  const { start, end } = malaysiaDayUtcBounds(date);
  let q2 = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true });
  q2 = applyShopScope(q2, shopId, companyShopIds);
  const { data: data2, error: error2 } = await q2;
  if (error2) throw error2;
  return mapRows(data2 as Record<string, unknown>[] | null).filter((r) => matchesEventDate(r, date));
}

/**
 * Load one staff member's attendance for one Malaysia calendar day.
 * When `allShops` is true (default for clock/status), includes every shop punch
 * so cross-shop breaks and hours stay on one attendance day.
 */
export async function fetchStaffAttendanceForDay(
  supabase: Supabase,
  params: { date: string; shopId?: string | null; staffId: string; allShops?: boolean },
): Promise<AttendanceRecord[]> {
  const scopeAllShops = params.allShops !== false;
  let q = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .eq("event_date", params.date)
    .eq("staff_id", params.staffId)
    .order("created_at", { ascending: true });
  if (!scopeAllShops && params.shopId) q = q.eq("shop_id", params.shopId);

  const { data, error } = await q;
  if (!error) {
    return mapRows(data as Record<string, unknown>[] | null).filter((r) =>
      matchesEventDate(r, params.date),
    );
  }

  const { start, end } = malaysiaDayUtcBounds(params.date);
  let fallback = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("staff_id", params.staffId)
    .order("created_at", { ascending: true });
  if (!scopeAllShops && params.shopId) fallback = fallback.eq("shop_id", params.shopId);

  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) throw fallbackError;
  return mapRows(fallbackData as Record<string, unknown>[] | null).filter((r) =>
    matchesEventDate(r, params.date),
  );
}

/** All punches for a staff member on a day (every shop). */
export async function fetchStaffAttendanceForDayAllShops(
  supabase: Supabase,
  params: { date: string; staffId: string },
): Promise<AttendanceRecord[]> {
  return fetchStaffAttendanceForDay(supabase, { ...params, allShops: true });
}

/** Load attendance between two YYYY-MM-DD Malaysia dates inclusive. */
export async function fetchAttendanceInRange(
  supabase: Supabase,
  from: string,
  to: string,
  shopId: string | null,
  companyShopIds?: string[] | null,
): Promise<AttendanceRecord[]> {
  let q = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .gte("event_date", from)
    .lte("event_date", to)
    .order("created_at", { ascending: true });
  q = applyShopScope(q, shopId, companyShopIds);

  const { data, error } = await q;
  if (!error) {
    return mapRows(data as Record<string, unknown>[] | null).filter((r) =>
      isEventDateInRange(r, from, to),
    );
  }

  const { start } = malaysiaDayUtcBounds(from);
  const { end } = malaysiaDayUtcBounds(to);
  let q2 = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true });
  q2 = applyShopScope(q2, shopId, companyShopIds);
  const { data: data2, error: error2 } = await q2;
  if (error2) throw error2;
  return mapRows(data2 as Record<string, unknown>[] | null).filter((r) =>
    isEventDateInRange(r, from, to),
  );
}
