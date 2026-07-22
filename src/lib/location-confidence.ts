import type { GpsVerifyTier } from "@/lib/gps-shop-verify";

/** UI label on clock page */
export type ConfidenceDisplayLabel = "Good" | "Fair" | "Weak" | "Rejected";

/** Shown in LocationStatusCard headline/badge */
export function confidenceUiLabel(label: ConfidenceDisplayLabel | null): string {
  if (label === "Good") return "Good";
  if (label === "Fair") return "Fair";
  if (label === "Weak") return "Weak / Try again";
  if (label === "Rejected") return "Rejected";
  return "Getting location…";
}

export const FAST_FAIR_MAX_ACCURACY_M = 100;

export type LocationConfidenceInput = {
  distanceM: number;
  effectiveRadiusM: number;
  accuracyM: number | null;
  sampleCount: number;
  sampleSpreadM: number | null;
  indoorProfile: boolean;
  /** Prior verified indoor session applied to this check */
  indoorSessionUsed: boolean;
  /** Session exists and is within drift (even if not used for pass) */
  hasActiveSession?: boolean;
};

export type LocationConfidenceResult = {
  score: number;
  tier: GpsVerifyTier;
  allowsPunch: boolean;
  reviewRequired: boolean;
  gpsVerified: boolean;
  displayLabel: ConfidenceDisplayLabel;
};

const SCORE_VERIFIED_MIN = 90;
const SCORE_WEAK_MIN = 60;
const SCORE_REVIEW_MIN = 30;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function distanceScore(distanceM: number, effectiveRadiusM: number): number {
  if (!Number.isFinite(distanceM) || !Number.isFinite(effectiveRadiusM) || effectiveRadiusM <= 0) {
    return 0;
  }
  if (distanceM <= effectiveRadiusM) {
    const ratio = distanceM / effectiveRadiusM;
    return Math.round(40 * (1 - ratio * 0.35));
  }
  const overshoot = distanceM - effectiveRadiusM;
  const margin = effectiveRadiusM * 0.25;
  if (overshoot >= margin) return 0;
  return Math.round(15 * (1 - overshoot / margin));
}

function accuracyScore(accuracyM: number | null, indoorProfile: boolean): number {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return indoorProfile ? 10 : 5;
  }
  const good = indoorProfile ? 50 : 35;
  const weak = indoorProfile ? 120 : 80;
  if (accuracyM <= good) return 25;
  if (accuracyM >= weak) return 4;
  const t = (accuracyM - good) / (weak - good);
  return Math.round(25 * (1 - t) + 4);
}

function stabilityScore(sampleCount: number, sampleSpreadM: number | null, indoorProfile: boolean): number {
  const spread = sampleSpreadM != null && Number.isFinite(sampleSpreadM) ? sampleSpreadM : 0;
  const count = Math.max(1, sampleCount);
  let score = 8;
  if (count >= 2) score += 4;
  if (count >= 4) score += 4;
  const spreadLimit = indoorProfile ? 55 : 40;
  if (spread <= 15) score += 8;
  else if (spread <= spreadLimit) score += Math.round(8 * (1 - (spread - 15) / (spreadLimit - 15)));
  else score -= Math.min(8, Math.round((spread - spreadLimit) / 15));
  return clamp(score, 0, 20);
}

function sessionBonus(indoorSessionUsed: boolean, hasActiveSession: boolean): number {
  if (indoorSessionUsed) return 15;
  if (hasActiveSession) return 8;
  return 0;
}

export function tierFromConfidenceScore(score: number): GpsVerifyTier {
  if (score >= SCORE_VERIFIED_MIN) return "verified";
  if (score >= SCORE_WEAK_MIN) return "weak_indoor";
  if (score >= SCORE_REVIEW_MIN) return "review_required";
  return "rejected";
}

export function displayLabelFromScore(score: number): ConfidenceDisplayLabel {
  if (score >= SCORE_VERIFIED_MIN) return "Good";
  if (score >= SCORE_WEAK_MIN) return "Fair";
  if (score >= SCORE_REVIEW_MIN) return "Weak";
  return "Rejected";
}

/** Punch allowed for Verified (90+) and Weak Indoor / Fair (60–89) only. */
export function allowsPunchFromScore(score: number): boolean {
  return score >= SCORE_WEAK_MIN;
}

/**
 * Shared client + server confidence model (0–100).
 */
export function computeLocationConfidence(input: LocationConfidenceInput): LocationConfidenceResult {
  const dist = distanceScore(input.distanceM, input.effectiveRadiusM);
  const acc = accuracyScore(input.accuracyM, input.indoorProfile);
  const stab = stabilityScore(input.sampleCount, input.sampleSpreadM, input.indoorProfile);
  const sess = sessionBonus(input.indoorSessionUsed, input.hasActiveSession === true);
  const raw = dist + acc + stab + sess;
  const score = clamp(Math.round(raw), 0, 100);
  const tier = tierFromConfidenceScore(score);
  const allowsPunch = allowsPunchFromScore(score);
  return {
    score,
    tier,
    allowsPunch,
    reviewRequired: tier === "review_required",
    gpsVerified: allowsPunch,
    displayLabel: displayLabelFromScore(score),
  };
}

export function punchBlockedMessage(score: number): string {
  if (score < SCORE_REVIEW_MIN) {
    return "Location confidence too low. Move closer to the shop or tap Refresh Location.";
  }
  if (score < SCORE_WEAK_MIN) {
    return "Location confidence is weak. Move nearer a verification point or tap Refresh Location.";
  }
  return "Location check failed.";
}

export const CONFIDENCE_THRESHOLDS = {
  verifiedMin: SCORE_VERIFIED_MIN,
  weakMin: SCORE_WEAK_MIN,
  reviewMin: SCORE_REVIEW_MIN,
} as const;

/** First sample within radius + accuracy ≤100m → at least Fair (60) for 12F indoor. */
export function applyFastFairBoost(
  score: number,
  distanceM: number,
  effectiveRadiusM: number,
  accuracyM: number | null,
  sampleCount: number,
): number {
  if (sampleCount !== 1) return score;
  if (accuracyM == null || accuracyM > FAST_FAIR_MAX_ACCURACY_M) return score;
  if (!Number.isFinite(distanceM) || distanceM > effectiveRadiusM) return score;
  return Math.max(score, SCORE_WEAK_MIN);
}
