import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import { fetchAttendanceForDay } from "@/lib/attendance-db";
import type { AttendanceRecord } from "@/lib/attendance";
import { validateForgotPunchApproval } from "@/lib/forgot-punch-validate";
import { detectDayAttendanceIssues } from "@/lib/attendance-issues";
import { forgotPunchActionType, type ForgotPunchRequestRow } from "@/lib/forgot-punch";
import { formatMalaysiaRecordedAt, malaysiaDateYmd } from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type ApproveForgotPunchResult =
  | { ok: true; attendanceId: string; auditOld: unknown; auditNew: unknown }
  | { ok: false; error: string };

export async function approveForgotPunchRequest(
  supabase: Supabase,
  request: ForgotPunchRequestRow,
  reviewedBy: string,
): Promise<ApproveForgotPunchResult> {
  const actionType = forgotPunchActionType(request.request_type);
  const requestedAt = new Date(request.requested_time);
  if (Number.isNaN(requestedAt.getTime())) {
    return { ok: false, error: "Invalid requested time." };
  }

  const dayYmd = malaysiaDateYmd(requestedAt);
  const { event_date, event_time } = buildAttendanceEventFields(requestedAt);

  const { data: staff, error: staffErr } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code, staff_type")
    .eq("id", request.staff_id)
    .maybeSingle();

  if (staffErr || !staff) {
    return { ok: false, error: staffErr?.message || "Staff not found." };
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, name")
    .eq("id", request.shop_id)
    .maybeSingle();

  if (shopErr || !shop) {
    return { ok: false, error: shopErr?.message || "Shop not found." };
  }

  const dayRows = await fetchAttendanceForDay(supabase, dayYmd, request.shop_id);
  const staffRows = dayRows.filter((r) => r.staff_id === request.staff_id);
  const approvalCheck = validateForgotPunchApproval(request, staffRows);
  if (!approvalCheck.ok) {
    return { ok: false, error: approvalCheck.error };
  }

  const beforeIssues = detectDayAttendanceIssues(staffRows, dayYmd);

  const auditOld = {
    day: dayYmd,
    issues: beforeIssues,
    punches: staffRows.map(summarizePunch),
  };

  const reasonLabel = request.reason.replace(/_/g, " ");
  const notePart = request.notes?.trim() ? ` Note: ${request.notes.trim()}` : "";
  const actionLabel = actionType.replace(/_/g, " ");
  const auditNote = `Forgot ${actionLabel} approved by admin. Reason: ${reasonLabel}.${notePart}`;

  const insertRow: Record<string, unknown> = {
    shop_id: request.shop_id,
    shop_name: shop.name,
    staff_id: staff.id,
    staff_name: staff.staff_name,
    staff_code: staff.staff_code,
    staff_type: staff.staff_type,
    action_type: actionType,
    event_date,
    event_time,
    staff_latitude: null,
    staff_longitude: null,
    distance_from_shop_meters: null,
    gps_accuracy_meters: null,
    gps_verified: false,
    gps_verify_tier: "review_required",
    gps_review_required: true,
    review_required: true,
    verification_method: "manual_approval",
    photo_proof_used: false,
    audit_notes: auditNote.slice(0, 500),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("attendance")
    .insert(insertRow)
    .select("id, action_type, event_date, event_time, created_at, verification_method")
    .single();

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message || "Could not create attendance." };
  }

  const afterRows = await fetchAttendanceForDay(supabase, dayYmd, request.shop_id);
  const staffAfter = afterRows.filter((r) => r.staff_id === request.staff_id);
  const afterIssues = detectDayAttendanceIssues(staffAfter, dayYmd);

  const auditNew = {
    attendance_id: inserted.id,
    action_type: actionType,
    event_date,
    event_time,
    requested_time: request.requested_time,
    paired_clock_in_id: approvalCheck.pairedClockInId ?? null,
    recorded_at: formatMalaysiaRecordedAt(String(inserted.created_at)),
    verification_method: "manual_approval",
    issues_after: afterIssues,
    punches: staffAfter.map(summarizePunch),
  };

  const reviewedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("forgot_punch_requests")
    .update({
      status: "approved",
      attendance_id: inserted.id,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      audit_old_json: auditOld,
      audit_new_json: auditNew,
    })
    .eq("id", request.id)
    .eq("status", "pending");

  if (updErr) {
    await supabase.from("attendance").delete().eq("id", inserted.id);
    return { ok: false, error: updErr.message };
  }

  return {
    ok: true,
    attendanceId: inserted.id as string,
    auditOld,
    auditNew,
  };
}

function summarizePunch(r: AttendanceRecord) {
  return {
    id: r.id,
    action_type: r.action_type,
    event_time: r.event_time,
    verification_method: r.verification_method,
  };
}
