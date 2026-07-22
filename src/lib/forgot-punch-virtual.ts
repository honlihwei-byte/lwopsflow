import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import {
  attendanceForTotals,
  attendancePhase,
  type AttendanceRecord,
  type AttendancePhase,
} from "@/lib/attendance";
import type { ForgotPunchRequestRow } from "@/lib/forgot-punch";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export const VIRTUAL_FORGOT_PUNCH_ID_PREFIX = "virtual-forgot-";
export const VIRTUAL_FORGOT_PUNCH_AUDIT =
  "Virtual clock in: pending forgot punch verification";

export type ForgotPunchVirtualContext = {
  pending_clock_in: ForgotPunchRequestRow | null;
  rejected_clock_in: ForgotPunchRequestRow | null;
};

export function isVirtualForgotPunchRow(row: Pick<AttendanceRecord, "id" | "audit_notes">): boolean {
  return (
    row.id.startsWith(VIRTUAL_FORGOT_PUNCH_ID_PREFIX) ||
    row.audit_notes === VIRTUAL_FORGOT_PUNCH_AUDIT
  );
}

export function realAttendanceRows(rows: AttendanceRecord[]): AttendanceRecord[] {
  return rows.filter((r) => !isVirtualForgotPunchRow(r));
}

export function hasRealClockIn(rows: AttendanceRecord[]): boolean {
  return attendanceForTotals(realAttendanceRows(rows)).some((r) => r.action_type === "clock_in");
}

export function buildVirtualClockInRecord(
  request: ForgotPunchRequestRow,
  shopName: string,
): AttendanceRecord {
  const requestedAt = new Date(request.requested_time);
  const { event_date, event_time } = buildAttendanceEventFields(requestedAt);
  return {
    id: `${VIRTUAL_FORGOT_PUNCH_ID_PREFIX}${request.id}`,
    shop_id: request.shop_id,
    shop_name: shopName,
    staff_id: request.staff_id,
    staff_name: "",
    staff_code: "",
    staff_type: "",
    action_type: "clock_in",
    event_date,
    event_time,
    created_at: request.requested_time,
    audit_notes: VIRTUAL_FORGOT_PUNCH_AUDIT,
    verification_method: "pending_forgot_punch",
  };
}

export function virtualClockInForPendingRequest(
  rows: AttendanceRecord[],
  pending: ForgotPunchRequestRow | null,
  shopName: string,
  dayYmd: string,
): AttendanceRecord | null {
  if (!pending || pending.request_type !== "forgot_clock_in" || pending.status !== "pending") {
    return null;
  }
  if (malaysiaDateYmd(new Date(pending.requested_time)) !== dayYmd) return null;
  if (hasRealClockIn(rows)) return null;
  return buildVirtualClockInRecord(pending, shopName);
}

export function attendancePhaseWithVirtualClockIn(
  rows: AttendanceRecord[],
  virtualClockIn: AttendanceRecord | null,
): AttendancePhase {
  if (!virtualClockIn) return attendancePhase(rows);
  return attendancePhase([...rows, virtualClockIn]);
}

function mapForgotPunchRow(row: Record<string, unknown>): ForgotPunchRequestRow {
  return {
    id: String(row.id),
    staff_id: String(row.staff_id),
    shop_id: String(row.shop_id),
    request_type: row.request_type as ForgotPunchRequestRow["request_type"],
    requested_time: String(row.requested_time),
    reason: row.reason as ForgotPunchRequestRow["reason"],
    notes: row.notes != null ? String(row.notes) : null,
    status: row.status as ForgotPunchRequestRow["status"],
    attendance_id: row.attendance_id != null ? String(row.attendance_id) : null,
    reviewed_by: row.reviewed_by != null ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at != null ? String(row.reviewed_at) : null,
    audit_old_json: row.audit_old_json,
    audit_new_json: row.audit_new_json,
    created_at: String(row.created_at),
  };
}

export async function loadForgotPunchVirtualContext(
  supabase: Supabase,
  params: { staffId: string; shopId: string; dayYmd: string },
): Promise<ForgotPunchVirtualContext> {
  const { data, error } = await supabase
    .from("forgot_punch_requests")
    .select("*")
    .eq("staff_id", params.staffId)
    .eq("shop_id", params.shopId)
    .eq("request_type", "forgot_clock_in")
    .in("status", ["pending", "rejected"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  let pending_clock_in: ForgotPunchRequestRow | null = null;
  let rejected_clock_in: ForgotPunchRequestRow | null = null;

  for (const raw of data ?? []) {
    const row = mapForgotPunchRow(raw as Record<string, unknown>);
    if (malaysiaDateYmd(new Date(row.requested_time)) !== params.dayYmd) continue;
    if (row.status === "pending" && !pending_clock_in) pending_clock_in = row;
    if (row.status === "rejected" && !rejected_clock_in) rejected_clock_in = row;
  }

  return { pending_clock_in, rejected_clock_in };
}
