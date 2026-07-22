import { haversineDistanceMeters } from "@/lib/geo";
import type { AttendanceVerificationMode } from "@/lib/shop-anti-buddy";
import type { IndoorGpsSession } from "@/lib/gps-indoor-session";
import { INDOOR_SESSION_MAX_DRIFT_M, isIndoorSessionUsable } from "@/lib/gps-indoor-session";
import {
  canUseIndoorRadiusFallback,
  expandedIndoorBaseRadius,
  indoorFallbackAttemptFromMultiplier,
  INDOOR_FALLBACK_HARD_REJECT_SCORE,
  INDOOR_FALLBACK_MAX_RADIUS_M,
  INDOOR_FALLBACK_STATUS_LABEL,
  type IndoorFallbackAttempt,
} from "@/lib/gps-indoor-fallback";
import {
  applyFastFairBoost,
  allowsPunchFromScore,
  computeLocationConfidence,
  displayLabelFromScore,
  tierFromConfidenceScore,
  type ConfidenceDisplayLabel,
} from "@/lib/location-confidence";

export type ShopGpsLocationType = "main" | "office" | "parking" | "loading" | "backup";

export type ShopGpsLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  location_type: ShopGpsLocationType;
};

export type ShopForPunch = {
  id: string;
  name: string;
  locations: ShopGpsLocation[];
  gpsIndoorMode?: boolean;
  allowPhotoProofFallback?: boolean;
  attendanceVerificationMode?: AttendanceVerificationMode | null;
};

export type ShopGpsPoint = {
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
};

export type GpsVerifyTier = "verified" | "weak_indoor" | "rejected" | "review_required";

export type GpsCheckResult = {
  staffLat: number;
  staffLng: number;
  distanceM: number;
  radiusM: number;
  effectiveRadiusM: number;
  gpsAccuracyMeters: number | null;
  gpsVerified: boolean;
  verifyTier: GpsVerifyTier;
  allowsPunch: boolean;
  weakAccuracy: boolean;
  reviewRequired: boolean;
  indoorSessionUsed: boolean;
};

export type GpsLocationMatchResult = GpsCheckResult & {
  matchedLocation: ShopGpsLocation | null;
  sampleCount: number;
  sampleSpreadM: number | null;
  locationConfidenceScore: number;
  confidenceDisplayLabel: ConfidenceDisplayLabel;
  /** Progressive radius expansion (shop gps_indoor_mode + weak accuracy). */
  indoorFallbackUsed: boolean;
  indoorFallbackAttempt: IndoorFallbackAttempt | null;
  gpsOriginalRadiusM: number | null;
  gpsExpandedRadiusM: number | null;
  verifyStatusLabel: string | null;
  gpsTrustedWindowUsed: boolean;
};

export type GpsVerifyContext = {
  sampleCount?: number;
  sampleSpreadM?: number | null;
  indoorSession?: IndoorGpsSession | null;
  shopIndoorMode?: boolean;
  /** ≥3 standard verifies on this device + shop within 30 min (client or server attested). */
  trustedDeviceFallback?: boolean;
  /** Progressive indoor verify attempt (1 = normal, 2 = ×1.5, 3 = ×2). */
  indoorVerifyAttempt?: IndoorFallbackAttempt;
};

export const TOO_FAR_MSG = "You are too far from this shop. Clock in/out is not allowed.";
export const GPS_WEAK_ACCURACY_THRESHOLD_M = 100;
export const GPS_INDOOR_GOOD_ACCURACY_M = 80;
export const GPS_UNSTABLE_SPREAD_M = 60;

const INDOOR_ACCURACY_FACTOR = 0.85;
const INDOOR_MAX_EXTRA_RADIUS_M = 120;
const OUTDOOR_ACCURACY_FACTOR = 0.5;
const OUTDOOR_MAX_EXTRA_RADIUS_M = 50;
const SESSION_GRACE_RADIUS_M = 30;
const REVIEW_MARGIN_FACTOR = 1.12;

/** Indoor adaptive radius / weak-indoor tiers — only when shop Indoor Confidence Mode is ON. */
export function shopUsesIndoorProfile(
  _locations: ShopGpsLocation[],
  shopIndoorMode?: boolean,
): boolean {
  return shopIndoorMode === true;
}

export function isIndoorConfidenceMode(context?: GpsVerifyContext): boolean {
  return context?.shopIndoorMode === true;
}

function locationPrefersIndoorRadius(type: ShopGpsLocationType, indoorProfile: boolean): boolean {
  if (!indoorProfile) return false;
  return type === "office" || type === "main";
}

/**
 * Adaptive pass radius: base + capped accuracy buffer (tighter outdoors).
 */
export function effectiveRadiusMeters(
  baseRadius: number,
  accuracyM: number | null,
  locationType: ShopGpsLocationType,
  indoorProfile: boolean,
): number {
  const indoorLike = indoorProfile && locationPrefersIndoorRadius(locationType, indoorProfile);
  const factor = indoorLike ? INDOOR_ACCURACY_FACTOR : OUTDOOR_ACCURACY_FACTOR;
  const cap = indoorLike ? INDOOR_MAX_EXTRA_RADIUS_M : OUTDOOR_MAX_EXTRA_RADIUS_M;
  const extra =
    accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0
      ? Math.min(accuracyM * factor, cap)
      : 0;
  return baseRadius + extra;
}

function classifyTier(
  distanceM: number,
  effectiveRadius: number,
  accuracyM: number | null,
  sampleSpreadM: number | null,
  sampleCount: number,
  indoorProfile: boolean,
): Pick<GpsCheckResult, "verifyTier" | "allowsPunch" | "gpsVerified" | "reviewRequired"> {
  const within = distanceM <= effectiveRadius;

  if (!within) {
    if (distanceM <= effectiveRadius * REVIEW_MARGIN_FACTOR && indoorProfile) {
      return {
        verifyTier: "review_required",
        allowsPunch: true,
        gpsVerified: true,
        reviewRequired: true,
      };
    }
    return {
      verifyTier: "rejected",
      allowsPunch: false,
      gpsVerified: false,
      reviewRequired: false,
    };
  }

  const spread =
    sampleSpreadM != null && Number.isFinite(sampleSpreadM) ? sampleSpreadM : null;
  const unstable =
    sampleCount >= 2 &&
    spread != null &&
    spread > GPS_UNSTABLE_SPREAD_M &&
    (accuracyM == null || accuracyM > GPS_INDOOR_GOOD_ACCURACY_M);

  const goodAccuracy =
    accuracyM != null && Number.isFinite(accuracyM) && accuracyM <= GPS_INDOOR_GOOD_ACCURACY_M;

  if (goodAccuracy && !unstable) {
    return {
      verifyTier: "verified",
      allowsPunch: true,
      gpsVerified: true,
      reviewRequired: false,
    };
  }

  if (unstable && indoorProfile) {
    return {
      verifyTier: "review_required",
      allowsPunch: true,
      gpsVerified: true,
      reviewRequired: true,
    };
  }

  const weakIndoor =
    indoorProfile ||
    (accuracyM != null && accuracyM > GPS_INDOOR_GOOD_ACCURACY_M) ||
    unstable;

  if (weakIndoor) {
    return {
      verifyTier: "weak_indoor",
      allowsPunch: true,
      gpsVerified: true,
      reviewRequired: false,
    };
  }

  return {
    verifyTier: "verified",
    allowsPunch: true,
    gpsVerified: true,
    reviewRequired: false,
  };
}

export function checkGpsAgainstPoint(
  point: ShopGpsPoint,
  staffLat: number,
  staffLng: number,
  accuracyM: number | null,
  opts?: {
    locationType?: ShopGpsLocationType;
    indoorProfile?: boolean;
    sampleSpreadM?: number | null;
    sampleCount?: number;
    /** Indoor fallback: fixed pass radius (base × multiplier, cap 200m). */
    passRadiusM?: number;
    /** Normal shops: configured radius only (no accuracy buffer). */
    strictBaseRadius?: boolean;
  },
): GpsCheckResult {
  const distanceM = haversineDistanceMeters(
    staffLat,
    staffLng,
    point.latitude,
    point.longitude,
  );
  const radiusM = point.allowed_radius_meters;
  const indoorProfile = opts?.indoorProfile ?? false;
  const locationType = opts?.locationType ?? "main";
  const effectiveRadius =
    opts?.passRadiusM != null && Number.isFinite(opts.passRadiusM)
      ? opts.passRadiusM
      : opts?.strictBaseRadius === true
        ? radiusM
        : effectiveRadiusMeters(radiusM, accuracyM, locationType, indoorProfile);

  const tierResult = classifyTier(
    distanceM,
    effectiveRadius,
    accuracyM,
    opts?.sampleSpreadM ?? null,
    opts?.sampleCount ?? 1,
    indoorProfile,
  );

  const weakAccuracy =
    accuracyM != null &&
    Number.isFinite(accuracyM) &&
    accuracyM > GPS_WEAK_ACCURACY_THRESHOLD_M;

  return {
    staffLat,
    staffLng,
    distanceM,
    radiusM,
    effectiveRadiusM: effectiveRadius,
    gpsAccuracyMeters: accuracyM,
    weakAccuracy,
    indoorSessionUsed: false,
    ...tierResult,
  };
}

/** @deprecated use checkGpsAgainstPoint or checkGpsAgainstLocations */
export function checkGpsAgainstShop(
  shop: ShopGpsPoint,
  staffLat: number,
  staffLng: number,
  accuracyM: number | null,
): GpsCheckResult {
  return checkGpsAgainstPoint(shop, staffLat, staffLng, accuracyM);
}

function applySessionGrace(
  result: GpsLocationMatchResult,
  session: IndoorGpsSession | null,
  staffLat: number,
  staffLng: number,
  indoorProfile: boolean,
  locations: ShopGpsLocation[],
  context: GpsVerifyContext,
): GpsLocationMatchResult {
  if (result.allowsPunch || !session || !indoorProfile) return result;
  if (!isIndoorSessionUsable(session, staffLat, staffLng)) return result;
  if (session.verifyTier === "rejected") return result;

  const sessionCheck = checkGpsAgainstLocations(
    locations,
    session.latitude,
    session.longitude,
    session.accuracyMeters,
    {
      sampleCount: context.sampleCount,
      sampleSpreadM: context.sampleSpreadM,
      shopIndoorMode: context.shopIndoorMode,
      indoorSession: null,
    },
  );
  if (!sessionCheck.allowsPunch) return result;

  const drift = haversineDistanceMeters(
    session.latitude,
    session.longitude,
    staffLat,
    staffLng,
  );
  if (drift > INDOOR_SESSION_MAX_DRIFT_M) return result;
  if (result.distanceM > sessionCheck.effectiveRadiusM + SESSION_GRACE_RADIUS_M) return result;

  return {
    ...result,
    gpsVerified: true,
    allowsPunch: true,
    verifyTier: "weak_indoor",
    reviewRequired: false,
    indoorSessionUsed: true,
    matchedLocation: sessionCheck.matchedLocation ?? result.matchedLocation,
    distanceM: result.distanceM,
    effectiveRadiusM: sessionCheck.effectiveRadiusM,
  };
}

/**
 * Verify against all active locations — pass if any match.
 * Uses closest matching location; if none match, distance is to closest point.
 */
export function checkGpsAgainstLocations(
  locations: ShopGpsLocation[],
  staffLat: number,
  staffLng: number,
  accuracyM: number | null,
  context?: GpsVerifyContext,
): GpsLocationMatchResult {
  const sampleCount = context?.sampleCount ?? 1;
  const sampleSpreadM = context?.sampleSpreadM ?? null;
  const indoorConfidence = isIndoorConfidenceMode(context);
  const indoorProfile = shopUsesIndoorProfile(locations, context?.shopIndoorMode);
  const strictBaseRadius = !indoorConfidence;

  const baseEmpty: GpsLocationMatchResult = {
    staffLat,
    staffLng,
    distanceM: Infinity,
    radiusM: 0,
    effectiveRadiusM: 0,
    gpsAccuracyMeters: accuracyM,
    gpsVerified: false,
    verifyTier: "rejected",
    allowsPunch: false,
    weakAccuracy:
      accuracyM != null &&
      Number.isFinite(accuracyM) &&
      accuracyM > GPS_WEAK_ACCURACY_THRESHOLD_M,
    reviewRequired: false,
    indoorSessionUsed: false,
    matchedLocation: null,
    sampleCount,
    sampleSpreadM,
    locationConfidenceScore: 0,
    confidenceDisplayLabel: "Rejected",
    ...EMPTY_FALLBACK_FIELDS,
  };

  if (locations.length === 0) {
    const empty = applySessionGrace(
      baseEmpty,
      context?.indoorSession ?? null,
      staffLat,
      staffLng,
      indoorProfile,
      locations,
      context ?? {},
    );
    return indoorConfidence
      ? applyConfidenceToResult(empty, context?.indoorSession ?? null, indoorProfile)
      : applySimpleOutdoorResult(empty);
  }

  const { bestPass, closestFailed } = pickBestLocationPass(
    locations,
    staffLat,
    staffLng,
    accuracyM,
    indoorProfile,
    sampleSpreadM,
    sampleCount,
    undefined,
    strictBaseRadius,
  );

  let result: GpsLocationMatchResult;

  if (bestPass) {
    result = {
      ...bestPass.check,
      matchedLocation: bestPass.location,
      sampleCount,
      sampleSpreadM,
      locationConfidenceScore: 0,
      confidenceDisplayLabel: "Rejected",
      ...EMPTY_FALLBACK_FIELDS,
    };
  } else {
    const fallback = closestFailed!;
    result = {
      ...fallback.check,
      matchedLocation: null,
      sampleCount,
      sampleSpreadM,
      locationConfidenceScore: 0,
      confidenceDisplayLabel: "Rejected",
      ...EMPTY_FALLBACK_FIELDS,
    };
  }

  const withSession = indoorConfidence
    ? applySessionGrace(
        result,
        context?.indoorSession ?? null,
        staffLat,
        staffLng,
        indoorProfile,
        locations,
        context ?? {},
      )
    : result;

  if (!indoorConfidence) {
    return applySimpleOutdoorResult(withSession);
  }

  let final = applyConfidenceToResult(
    withSession,
    context?.indoorSession ?? null,
    indoorProfile,
  );

  if (!final.allowsPunch) {
    const attempt = context?.indoorVerifyAttempt ?? 1;
    const expanded = tryIndoorRadiusFallback(
      locations,
      staffLat,
      staffLng,
      accuracyM,
      context ?? {},
      indoorProfile,
      sampleCount,
      sampleSpreadM,
      final.locationConfidenceScore,
      attempt,
    );
    if (expanded) final = expanded;
  }

  return final;
}

const EMPTY_FALLBACK_FIELDS = {
  indoorFallbackUsed: false,
  indoorFallbackAttempt: null,
  gpsOriginalRadiusM: null,
  gpsExpandedRadiusM: null,
  verifyStatusLabel: null,
  gpsTrustedWindowUsed: false,
} as const;

function minDistanceToAnyLocationM(
  locations: ShopGpsLocation[],
  staffLat: number,
  staffLng: number,
): number {
  if (locations.length === 0) return Infinity;
  let min = Infinity;
  for (const loc of locations) {
    const d = haversineDistanceMeters(
      staffLat,
      staffLng,
      loc.latitude,
      loc.longitude,
    );
    if (d < min) min = d;
  }
  return min;
}

/** Beyond max expanded pass (200m) on every point — no fallback. */
function isClearlyOutsideAllPoints(
  locations: ShopGpsLocation[],
  staffLat: number,
  staffLng: number,
): boolean {
  return minDistanceToAnyLocationM(locations, staffLat, staffLng) > INDOOR_FALLBACK_MAX_RADIUS_M;
}

type LocationPassPick = {
  location: ShopGpsLocation;
  check: GpsCheckResult;
};

function applySimpleOutdoorResult(result: GpsLocationMatchResult): GpsLocationMatchResult {
  return {
    ...result,
    locationConfidenceScore: 0,
    confidenceDisplayLabel: result.allowsPunch ? "Good" : "Rejected",
    verifyTier: result.allowsPunch ? result.verifyTier : "rejected",
    allowsPunch: result.allowsPunch,
    gpsVerified: result.allowsPunch,
    reviewRequired: false,
    ...EMPTY_FALLBACK_FIELDS,
  };
}

function pickBestLocationPass(
  locations: ShopGpsLocation[],
  staffLat: number,
  staffLng: number,
  accuracyM: number | null,
  indoorProfile: boolean,
  sampleSpreadM: number | null,
  sampleCount: number,
  passRadiusForLocation?: (location: ShopGpsLocation) => number | undefined,
  strictBaseRadius = false,
): { bestPass: LocationPassPick | null; closestFailed: LocationPassPick | null } {
  let bestPass: LocationPassPick | null = null;
  let bestPassRank = -1;
  let closestFailed: LocationPassPick | null = null;

  const tierRank: Record<GpsVerifyTier, number> = {
    verified: 3,
    weak_indoor: 2,
    review_required: 1,
    rejected: 0,
  };

  for (const location of locations) {
    const passRadiusM = passRadiusForLocation?.(location);
    const check = checkGpsAgainstPoint(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        allowed_radius_meters: location.allowed_radius_meters,
      },
      staffLat,
      staffLng,
      accuracyM,
      {
        locationType: location.location_type,
        indoorProfile,
        sampleSpreadM,
        sampleCount,
        ...(passRadiusM != null ? { passRadiusM } : {}),
        ...(strictBaseRadius ? { strictBaseRadius: true } : {}),
      },
    );

    if (check.allowsPunch) {
      const rank = tierRank[check.verifyTier];
      if (
        !bestPass ||
        rank > bestPassRank ||
        (rank === bestPassRank && check.distanceM < bestPass.check.distanceM)
      ) {
        bestPass = { location, check };
        bestPassRank = rank;
      }
    } else if (!closestFailed || check.distanceM < closestFailed.check.distanceM) {
      closestFailed = { location, check };
    }
  }

  return { bestPass, closestFailed };
}

function tryIndoorRadiusFallback(
  locations: ShopGpsLocation[],
  staffLat: number,
  staffLng: number,
  accuracyM: number | null,
  context: GpsVerifyContext,
  indoorProfile: boolean,
  sampleCount: number,
  sampleSpreadM: number | null,
  preliminaryScore: number,
  attempt: IndoorFallbackAttempt,
): GpsLocationMatchResult | null {
  if (attempt <= 1) return null;
  if (preliminaryScore < INDOOR_FALLBACK_HARD_REJECT_SCORE) return null;
  if (isClearlyOutsideAllPoints(locations, staffLat, staffLng)) return null;
  if (
    !canUseIndoorRadiusFallback(
      context.shopIndoorMode,
      accuracyM,
      preliminaryScore,
      context.trustedDeviceFallback === true,
    )
  ) {
    return null;
  }

  const multiplier = attempt === 2 ? 1.5 : 2;

  const { bestPass } = pickBestLocationPass(
    locations,
    staffLat,
    staffLng,
    accuracyM,
    indoorProfile,
    sampleSpreadM,
    sampleCount,
    (location) => expandedIndoorBaseRadius(location.allowed_radius_meters, multiplier),
  );

  if (!bestPass) return null;

  const originalRadiusM = bestPass.location.allowed_radius_meters;
  const expandedRadiusM = expandedIndoorBaseRadius(originalRadiusM, multiplier);

  let result: GpsLocationMatchResult = {
    ...bestPass.check,
    matchedLocation: bestPass.location,
    sampleCount,
    sampleSpreadM,
    locationConfidenceScore: 0,
    confidenceDisplayLabel: "Rejected",
    indoorFallbackUsed: true,
    indoorFallbackAttempt: indoorFallbackAttemptFromMultiplier(multiplier),
    gpsOriginalRadiusM: originalRadiusM,
    gpsExpandedRadiusM: expandedRadiusM,
    verifyStatusLabel: INDOOR_FALLBACK_STATUS_LABEL,
    gpsTrustedWindowUsed: true,
    verifyTier: "weak_indoor",
    allowsPunch: true,
    gpsVerified: true,
    reviewRequired: true,
  };

  result = applyConfidenceToResult(result, context.indoorSession ?? null, indoorProfile);
  return result.allowsPunch ? result : null;
}

function applyConfidenceToResult(
  result: GpsLocationMatchResult,
  session: IndoorGpsSession | null,
  indoorProfile: boolean,
): GpsLocationMatchResult {
  const hasActiveSession =
    session != null &&
    isIndoorSessionUsable(session, result.staffLat, result.staffLng) &&
    session.verifyTier !== "rejected";

  let confidence = computeLocationConfidence({
    distanceM: result.distanceM,
    effectiveRadiusM: result.effectiveRadiusM,
    accuracyM: result.gpsAccuracyMeters,
    sampleCount: result.sampleCount,
    sampleSpreadM: result.sampleSpreadM,
    indoorProfile,
    indoorSessionUsed: result.indoorSessionUsed,
    hasActiveSession,
  });

  const boostedScore = applyFastFairBoost(
    confidence.score,
    result.distanceM,
    result.effectiveRadiusM,
    result.gpsAccuracyMeters,
    result.sampleCount,
  );

  if (boostedScore !== confidence.score) {
    const tier = tierFromConfidenceScore(boostedScore);
    confidence = {
      score: boostedScore,
      tier,
      allowsPunch: allowsPunchFromScore(boostedScore),
      reviewRequired: tier === "review_required",
      gpsVerified: allowsPunchFromScore(boostedScore),
      displayLabel: displayLabelFromScore(boostedScore),
    };
  }

  if (result.indoorFallbackUsed && confidence.score < 60) {
    const tier = tierFromConfidenceScore(60);
    confidence = {
      score: 60,
      tier: "weak_indoor",
      allowsPunch: true,
      reviewRequired: true,
      gpsVerified: true,
      displayLabel: "Fair",
    };
  }

  return {
    ...result,
    locationConfidenceScore: confidence.score,
    confidenceDisplayLabel: confidence.displayLabel,
    verifyTier: result.indoorFallbackUsed ? "weak_indoor" : confidence.tier,
    allowsPunch: result.indoorFallbackUsed ? true : confidence.allowsPunch,
    gpsVerified: result.indoorFallbackUsed ? true : confidence.gpsVerified,
    reviewRequired: result.indoorFallbackUsed ? true : confidence.reviewRequired,
    verifyStatusLabel: result.indoorFallbackUsed
      ? INDOOR_FALLBACK_STATUS_LABEL
      : result.verifyStatusLabel,
  };
}

export function gpsStatusLabelFromTier(
  tier: GpsVerifyTier | null | undefined,
  hasCoords: boolean,
): "Verified" | "Weak Indoor" | "Rejected" | "Review Required" | "Location not available" {
  if (!hasCoords) return "Location not available";
  switch (tier) {
    case "verified":
      return "Verified";
    case "weak_indoor":
      return "Weak Indoor";
    case "review_required":
      return "Review Required";
    case "rejected":
      return "Rejected";
    default:
      return "Rejected";
  }
}
