import type { AttendanceRecord } from "@/lib/attendance";
import {
  isIndoorConfidenceMethod,
  isIndoorFallbackMethod,
  isLegacyGpsVerified,
  isManualApprovalMethod,
  isPhotoProofMethod,
  isRandomSelfieMethod,
} from "@/lib/verification-method";

/** Admin-facing GPS status (attendance table). */
export type GpsDisplayStatus =
  | "GPS OK"
  | "Weak GPS"
  | "Outside Radius"
  | "Location Not Available"
  | "Indoor Review"
  | "Expanded Radius"
  | "Photo Proof"
  | "Manual Approved"
  | "Rejected";

export function isWithinGpsRadius(record: AttendanceRecord): boolean {
  const distance = record.distance_from_shop_meters;
  const radius = record.gps_radius_used_meters;
  if (distance == null || radius == null || !Number.isFinite(distance) || !Number.isFinite(radius)) {
    return record.gps_verified === true;
  }
  return distance <= radius;
}

export function gpsDisplayStatus(record: AttendanceRecord): GpsDisplayStatus {
  if (isManualApprovalMethod(record.verification_method)) {
    return "Manual Approved";
  }
  if (
    record.photo_proof_used ||
    isPhotoProofMethod(record.verification_method) ||
    isRandomSelfieMethod(record.verification_method)
  ) {
    return "Photo Proof";
  }

  if (record.staff_latitude == null || record.staff_longitude == null) {
    return "Location Not Available";
  }

  const tier = record.gps_verify_tier;
  const withinRadius = isWithinGpsRadius(record);

  if (tier === "rejected") {
    return "Outside Radius";
  }
  if (!withinRadius && record.distance_from_shop_meters != null && record.gps_radius_used_meters != null) {
    return "Outside Radius";
  }

  if (
    record.gps_verified === true &&
    (tier === "verified" || isLegacyGpsVerified(record.verification_method)) &&
    withinRadius
  ) {
    if (record.gps_review_required === true || tier === "review_required") {
      return "Indoor Review";
    }
    return "GPS OK";
  }

  if (
    withinRadius &&
    (record.gps_result_reason?.toLowerCase().includes("expanded") ||
      record.gps_indoor_fallback_used === true)
  ) {
    if (record.gps_verified === true && tier === "verified") {
      return "Expanded Radius";
    }
  }

  if (tier === "weak_indoor" || record.gps_confidence_label === "Weak") {
    return "Weak GPS";
  }

  if (isIndoorFallbackMethod(record.verification_method, record.gps_indoor_fallback_used)) {
    return record.gps_verified === true && withinRadius ? "Weak GPS" : "Outside Radius";
  }

  if (isIndoorConfidenceMethod(record.verification_method)) {
    if (record.gps_verified && withinRadius) {
      return record.gps_review_required ? "Indoor Review" : "GPS OK";
    }
    return "Weak GPS";
  }

  if (record.gps_review_required === true || tier === "review_required") {
    return "Indoor Review";
  }

  if (record.gps_verified === true && withinRadius) {
    return "GPS OK";
  }

  return "Rejected";
}

/** Orange "Review" chip on GPS column — GPS-related only (not selfie upload). */
export function gpsShowReviewChip(record: AttendanceRecord): boolean {
  const status = gpsDisplayStatus(record);
  return (
    status === "Indoor Review" ||
    status === "Weak GPS" ||
    status === "Outside Radius" ||
    status === "Rejected" ||
    status === "Expanded Radius"
  );
}

export function gpsDisplayStatusClassName(status: GpsDisplayStatus): string {
  switch (status) {
    case "GPS OK":
    case "Manual Approved":
      return "text-emerald-700 dark:text-emerald-300";
    case "Weak GPS":
    case "Expanded Radius":
    case "Indoor Review":
      return "text-amber-700 dark:text-amber-300";
    case "Photo Proof":
      return "text-violet-700 dark:text-violet-300";
    case "Outside Radius":
    case "Location Not Available":
    case "Rejected":
      return "text-red-700 dark:text-red-300";
    default:
      return "text-zinc-500";
  }
}
