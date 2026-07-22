import { gpsStatusLabel, type AttendanceRecord, type GpsStatusLabel } from "@/lib/attendance";
import {
  isPhotoProofMethod,
  isRandomSelfieMethod,
} from "@/lib/verification-method";

/** Staff-facing location status codes (translate in UI via `employee.status.*`). */
export type StaffLocationCode =
  | "location_approved"
  | "location_rejected"
  | "photo_proof"
  | "location_unavailable";

/** @deprecated Use `StaffLocationCode` + i18n in UI. */
export const STAFF_LOCATION_APPROVED = "Location approved";
/** @deprecated Use `StaffLocationCode` + i18n in UI. */
export const STAFF_PHOTO_PROOF_SUBMITTED = "Photo proof submitted";
/** @deprecated Use `StaffLocationCode` + i18n in UI. */
export const STAFF_LOCATION_UNAVAILABLE = "Location not available. Please retry.";

export function staffPunchLocationCodeFromTechnical(
  technical: GpsStatusLabel | string,
): StaffLocationCode {
  switch (technical) {
    case "Rejected":
      return "location_rejected";
    case "Location not available":
      return "location_unavailable";
    case "Photo Proof":
      return "photo_proof";
    case "Verified":
    case "Weak Indoor":
    case "Expanded Radius":
    case "Review Required":
    case "Manual Approved":
      return "location_approved";
    default:
      return "location_approved";
  }
}

export function staffPunchLocationCodeFromRecord(
  record: Pick<
    AttendanceRecord,
    | "photo_proof_used"
    | "verification_method"
    | "gps_verified"
    | "gps_verify_tier"
    | "staff_latitude"
    | "staff_longitude"
    | "gps_indoor_fallback_used"
    | "review_required"
  >,
): StaffLocationCode {
  if (
    record.photo_proof_used ||
    isPhotoProofMethod(record.verification_method) ||
    isRandomSelfieMethod(record.verification_method)
  ) {
    return "photo_proof";
  }
  return staffPunchLocationCodeFromTechnical(gpsStatusLabel(record as AttendanceRecord));
}

/** @deprecated Prefer `staffPunchLocationCodeFromTechnical` + i18n. */
export function staffPunchLocationLabelFromTechnical(technical: GpsStatusLabel | string): string {
  switch (staffPunchLocationCodeFromTechnical(technical)) {
    case "location_rejected":
      return "Location rejected";
    case "location_unavailable":
      return STAFF_LOCATION_UNAVAILABLE;
    case "photo_proof":
      return STAFF_PHOTO_PROOF_SUBMITTED;
    default:
      return STAFF_LOCATION_APPROVED;
  }
}

/** @deprecated Prefer `staffPunchLocationCodeFromRecord` + i18n. */
export function staffPunchLocationLabelFromRecord(
  record: Pick<
    AttendanceRecord,
    | "photo_proof_used"
    | "verification_method"
    | "gps_verified"
    | "gps_verify_tier"
    | "staff_latitude"
    | "staff_longitude"
    | "gps_indoor_fallback_used"
    | "review_required"
  >,
): string {
  return staffPunchLocationLabelFromTechnical(
    staffPunchLocationCodeFromRecord(record) === "photo_proof"
      ? "Photo Proof"
      : gpsStatusLabel(record as AttendanceRecord),
  );
}

export function staffPunchLocationClassName(code: StaffLocationCode | string): string {
  if (code === "photo_proof") {
    return "text-violet-700 dark:text-violet-300";
  }
  if (code === "location_unavailable" || code === "location_rejected") {
    return "text-red-700 dark:text-red-300";
  }
  return "text-teal-700 dark:text-teal-300";
}

/** @deprecated Use `translateEmployeeStatus(t, actionType)` in UI. */
export function staffClockActionLabel(actionType: "clock_in" | "clock_out"): string {
  return actionType === "clock_in" ? "Clock In" : "Clock Out";
}

/** @deprecated Use `translatePunchSuccessToast(t, actionType)` in UI. */
export function formatPunchSubmittedToast(actionType: "clock_in" | "clock_out"): string {
  return actionType === "clock_in" ? "Clock In Successful" : "Clock Out Successful";
}
