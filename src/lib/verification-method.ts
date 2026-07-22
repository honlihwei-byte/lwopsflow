export type VerificationMethod =
  | "gps"
  | "indoor_confidence"
  | "indoor_fallback"
  | "photo_proof"
  | "random_selfie"
  | "selfie_proof"
  | "manual_approval";

/** Legacy DB values still read in reports. */
export type LegacyVerificationMethod =
  | VerificationMethod
  | "gps_verified"
  | "gps_weak_indoor";

export function verificationMethodForGpsPunch(
  shopIndoorMode: boolean,
  indoorFallbackUsed: boolean,
): VerificationMethod {
  if (indoorFallbackUsed) return "indoor_fallback";
  if (shopIndoorMode) return "indoor_confidence";
  return "gps";
}

export function isPhotoProofMethod(method: string | null | undefined): boolean {
  return method === "photo_proof";
}

export function isRandomSelfieMethod(method: string | null | undefined): boolean {
  return method === "random_selfie";
}

export function isSelfieProofMethod(method: string | null | undefined): boolean {
  return method === "selfie_proof";
}

export function isIndoorFallbackMethod(
  method: string | null | undefined,
  gpsIndoorFallbackUsed?: boolean | null,
): boolean {
  return method === "indoor_fallback" || gpsIndoorFallbackUsed === true;
}

export function isIndoorConfidenceMethod(method: string | null | undefined): boolean {
  return method === "indoor_confidence";
}

export function isLegacyGpsVerified(method: string | null | undefined): boolean {
  return method === "gps" || method === "gps_verified";
}

export function isManualApprovalMethod(method: string | null | undefined): boolean {
  return method === "manual_approval";
}
