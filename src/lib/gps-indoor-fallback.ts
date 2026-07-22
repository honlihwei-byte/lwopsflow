/** High-rise indoor: trusted-device progressive base-radius expansion. */

/** Hard reject fallback attempts below this score. */
export const INDOOR_FALLBACK_HARD_REJECT_SCORE = 50;
/** Minimum score to attempt trusted fallback (after standard pass fails). */
export const INDOOR_FALLBACK_MIN_CONFIDENCE = 60;
export const INDOOR_FALLBACK_MIN_ACCURACY_M = 50;
export const INDOOR_FALLBACK_MAX_RADIUS_M = 200;

/** Attempt 1 = standard verify; 2 = ×1.5; 3 = ×2 (capped at 200 m). One multiplier per verify round. */
export const INDOOR_FALLBACK_RADIUS_MULTIPLIERS = [1, 1.5, 2] as const;

export type IndoorFallbackAttempt = 1 | 2 | 3;

export const INDOOR_FALLBACK_ACTIVATED_MSG = "Indoor trusted fallback activated";
export const INDOOR_FALLBACK_FAIL_MSG =
  "Location not reliable. Please refresh location.";
export const INDOOR_FALLBACK_STATUS_LABEL = "Weak Indoor / Expanded Radius";

export function indoorFallbackExpandedRadiusMsg(expandedRadiusM: number): string {
  return `Expanded radius: ${Math.round(expandedRadiusM)} m`;
}

export function expandedIndoorBaseRadius(
  baseRadiusM: number,
  multiplier: number,
): number {
  if (!Number.isFinite(baseRadiusM) || baseRadiusM <= 0) return 0;
  return Math.min(Math.round(baseRadiusM * multiplier), INDOOR_FALLBACK_MAX_RADIUS_M);
}

export function indoorFallbackAttemptFromMultiplier(
  multiplier: number,
): IndoorFallbackAttempt {
  if (multiplier >= 2) return 3;
  if (multiplier >= 1.5) return 2;
  return 1;
}

export function canUseIndoorRadiusFallback(
  shopIndoorMode: boolean | undefined,
  accuracyM: number | null,
  preliminaryConfidenceScore: number,
  trustedDeviceFallback: boolean,
): boolean {
  if (preliminaryConfidenceScore < INDOOR_FALLBACK_HARD_REJECT_SCORE) return false;
  return (
    shopIndoorMode === true &&
    trustedDeviceFallback === true &&
    accuracyM != null &&
    Number.isFinite(accuracyM) &&
    accuracyM > INDOOR_FALLBACK_MIN_ACCURACY_M &&
    preliminaryConfidenceScore >= INDOOR_FALLBACK_MIN_CONFIDENCE
  );
}
