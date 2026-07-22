import type { GpsLocationMatchResult } from "@/lib/gps-shop-verify";
import type { ConfidenceDisplayLabel } from "@/lib/location-confidence";

/** Staff-facing confidence tier for location details panel. */
export function staffGpsConfidenceTier(
  label: ConfidenceDisplayLabel | null,
  score: number | null,
): "High" | "Medium" | "Low" {
  if (label === "Good") return "High";
  if (label === "Fair") return "Medium";
  if (label === "Weak") return "Low";
  if (label === "Rejected") return "Low";
  if (score != null && score >= 90) return "High";
  if (score != null && score >= 60) return "Medium";
  return "Low";
}

export function gpsRadiusUsedMeters(gps: GpsLocationMatchResult): number | null {
  if (gps.indoorFallbackUsed && gps.gpsExpandedRadiusM != null) {
    return gps.gpsExpandedRadiusM;
  }
  if (Number.isFinite(gps.effectiveRadiusM) && gps.effectiveRadiusM > 0) {
    return gps.effectiveRadiusM;
  }
  if (Number.isFinite(gps.radiusM) && gps.radiusM > 0) {
    return gps.radiusM;
  }
  return null;
}

export function gpsResultReasonFromCheck(gps: GpsLocationMatchResult): string {
  if (gps.indoorFallbackUsed) {
    return gps.verifyStatusLabel ?? "Expanded radius fallback";
  }
  if (gps.indoorSessionUsed) {
    return "Indoor session grace";
  }
  if (gps.verifyTier === "weak_indoor") {
    return "Weak indoor GPS — within radius";
  }
  if (gps.verifyTier === "review_required") {
    return "GPS review required";
  }
  if (gps.weakAccuracy) {
    return "Weak GPS accuracy";
  }
  if (gps.allowsPunch) {
    return "Within shop radius";
  }
  return "Location rejected";
}

export function gpsAuditFieldsFromCheck(gps: GpsLocationMatchResult): {
  gps_radius_used_meters: number | null;
  gps_confidence_label: string | null;
  gps_verify_attempt: number | null;
  gps_result_reason: string | null;
} {
  const radiusUsed = gpsRadiusUsedMeters(gps);
  return {
    gps_radius_used_meters:
      radiusUsed != null ? Math.round(radiusUsed * 100) / 100 : null,
    gps_confidence_label: gps.confidenceDisplayLabel ?? null,
    gps_verify_attempt: gps.indoorFallbackAttempt ?? null,
    gps_result_reason: gpsResultReasonFromCheck(gps),
  };
}
