import type { AttendanceRecord } from "@/lib/attendance";
import { isSelfieProofMethod } from "@/lib/verification-method";

export type SelfieAttendanceStatus =
  | "none"
  | "not_required"
  | "pending_upload"
  | "attached"
  | "verified"
  | "upload_failed";

export function selfieStatusForRecord(
  record: Pick<
    AttendanceRecord,
    | "selfie_proof_used"
    | "selfie_proof_path"
    | "selfie_captured_at"
    | "selfie_upload_status"
    | "verification_method"
    | "audit_notes"
  >,
): SelfieAttendanceStatus {
  if (record.selfie_upload_status === "not_required") return "not_required";
  if (record.selfie_proof_path) {
    if (record.selfie_proof_used || isSelfieProofMethod(record.verification_method)) {
      return "verified";
    }
    return "attached";
  }
  if (record.selfie_upload_status === "failed") return "upload_failed";
  if (record.selfie_upload_status === "pending" || record.selfie_captured_at) {
    return "pending_upload";
  }
  if (/selfie.*pending/i.test(record.audit_notes ?? "")) return "pending_upload";
  if (/selfie upload failed/i.test(record.audit_notes ?? "")) return "upload_failed";
  return "none";
}

export function selfieStatusLabel(status: SelfieAttendanceStatus): string {
  switch (status) {
    case "verified":
    case "attached":
      return "View selfie";
    case "not_required":
      return "Not required";
    case "pending_upload":
      return "Pending upload";
    case "upload_failed":
      return "Upload failed";
    default:
      return "No selfie";
  }
}

export function hasSelfieOnRecord(
  record: Pick<
    AttendanceRecord,
    "selfie_proof_path" | "selfie_captured_at" | "selfie_upload_status"
  >,
): boolean {
  return Boolean(
    record.selfie_proof_path ||
      record.selfie_captured_at ||
      record.selfie_upload_status === "pending" ||
      record.selfie_upload_status === "failed",
  );
}
