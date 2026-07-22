import {
  canUseIndoorRadiusFallback,
  INDOOR_FALLBACK_ACTIVATED_MSG,
  INDOOR_FALLBACK_FAIL_MSG,
  type IndoorFallbackAttempt,
} from "@/lib/gps-indoor-fallback";
import {
  gpsRadiusUsedMeters,
  gpsResultReasonFromCheck,
  staffGpsConfidenceTier,
} from "@/lib/gps-punch-audit";
import {
  getTrustedFallbackEligibility,
  recordTrustedVerification,
} from "@/lib/gps-indoor-trusted-device";
import {
  checkGpsAgainstLocations,
  TOO_FAR_MSG,
  GPS_UNSTABLE_SPREAD_M,
  type GpsVerifyTier,
  type ShopForPunch,
  type ShopGpsLocationType,
} from "@/lib/gps-shop-verify";
import type { ConfidenceDisplayLabel } from "@/lib/location-confidence";
import { allowsPunchFromScore } from "@/lib/location-confidence";
import {
  readIndoorGpsSession,
  saveIndoorGpsSession,
  type IndoorGpsSession,
} from "@/lib/gps-indoor-session";
import {
  getIndoorVerifyFailureCount,
  indoorVerifyAttemptFromFailureCount,
  recordIndoorVerifyFailure,
  resetIndoorVerifyFailures,
} from "@/lib/photo-proof-failure-counter";
import { formatVerifiedViaLabel } from "@/lib/shop-gps-locations";
import {
  forceRefreshGpsPosition,
  getCachedGpsPosition,
  getCachedGpsPositionForDisplay,
  getGpsSampleMeta,
  getLocationPrepareSnapshot,
  GPS_CHECKING_TIMEOUT_MSG,
  GPS_INDOOR_HINT,
  GPS_MAX_CHECK_MS,
  GPS_OUTDOOR_MAX_CHECK_MS,
  GPS_UNAVAILABLE_MSG,
  GPS_WEAK_ACCURACY_METERS,
  pauseClockGpsSampling,
  resumeClockGpsSampling,
  setGpsEarlyStopListener,
  startPreparedLocationService,
  subscribeGpsCache,
  type CachedGpsPosition,
} from "@/lib/geolocation-client";

export type VerifiedGps = CachedGpsPosition & {
  distanceMeters: number;
  gpsVerified: true;
  verifyTier: GpsVerifyTier;
  reviewRequired: boolean;
  indoorSessionUsed: boolean;
  matchedLocationId: string;
  matchedLocationName: string;
  matchedLocationType: ShopGpsLocationType;
  sampleCount: number;
  sampleSpreadMeters: number;
  locationConfidenceScore: number;
  confidenceDisplayLabel: ConfidenceDisplayLabel;
  allowsPunch: boolean;
  indoorFallbackUsed: boolean;
  gpsOriginalRadiusM: number | null;
  gpsExpandedRadiusM: number | null;
  verifyStatusLabel: string | null;
  gpsTrustedWindowUsed: boolean;
  baseRadiusM: number | null;
  effectiveRadiusM: number | null;
  radiusUsedM: number | null;
  indoorVerifyAttempt: IndoorFallbackAttempt | null;
  resultReason: string | null;
};

export { getPunchDeviceId } from "@/lib/gps-indoor-trusted-device";

export type ClockGpsVerifyPhase =
  | "checking"
  | "verified"
  | "weak_indoor"
  | "too_far"
  | "unstable"
  | "error";

export type ClockGpsVerifySnapshot = {
  phase: ClockGpsVerifyPhase;
  verifyTier: GpsVerifyTier | null;
  error: string | null;
  tooFarMessage: string | null;
  verified: VerifiedGps | null;
  verifiedViaLabel: string | null;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  sampleCount: number;
  sampleSpreadMeters: number;
  isCheckingLocation: boolean;
  reviewRequired: boolean;
  indoorSessionUsed: boolean;
  locationConfidenceScore: number | null;
  confidenceDisplayLabel: ConfidenceDisplayLabel | null;
  indoorFallbackUsed: boolean;
  verifyStatusLabel: string | null;
  gpsOriginalRadiusM: number | null;
  gpsExpandedRadiusM: number | null;
  gpsTrustedWindowUsed: boolean;
  indoorConfidenceMode: boolean;
  baseRadiusM: number | null;
  effectiveRadiusM: number | null;
  radiusUsedM: number | null;
  indoorVerifyAttempt: IndoorFallbackAttempt | null;
  approvalReason: string | null;
  confidenceTier: "High" | "Medium" | "Low" | null;
};

const INITIAL_SNAPSHOT: ClockGpsVerifySnapshot = {
  phase: "checking",
  verifyTier: null,
  error: null,
  tooFarMessage: null,
  verified: null,
  verifiedViaLabel: null,
  distanceMeters: null,
  accuracyMeters: null,
  sampleCount: 0,
  sampleSpreadMeters: 0,
  isCheckingLocation: false,
  reviewRequired: false,
  indoorSessionUsed: false,
  locationConfidenceScore: null,
  confidenceDisplayLabel: null,
  indoorFallbackUsed: false,
  verifyStatusLabel: null,
  gpsOriginalRadiusM: null,
  gpsExpandedRadiusM: null,
  gpsTrustedWindowUsed: false,
  indoorConfidenceMode: false,
  baseRadiusM: null,
  effectiveRadiusM: null,
  radiusUsedM: null,
  indoorVerifyAttempt: null,
  approvalReason: null,
  confidenceTier: null,
};

function checkingDeadlineMs(): number {
  return activeShop?.gpsIndoorMode ? GPS_MAX_CHECK_MS : GPS_OUTDOOR_MAX_CHECK_MS;
}

let cachedSnapshot: ClockGpsVerifySnapshot = INITIAL_SNAPSHOT;

let activeShop: ShopForPunch | null = null;
let activeStaffId: string | null = null;
let verified: VerifiedGps | null = null;
let phase: ClockGpsVerifyPhase = "checking";
let verifyTier: GpsVerifyTier | null = null;
let verifyError: string | null = null;
let tooFarMessage: string | null = null;
let distanceMeters: number | null = null;
let accuracyMeters: number | null = null;
let sampleCount = 0;
let sampleSpreadMeters = 0;
let verifiedViaLabel: string | null = null;
let isCheckingLocation = false;
let checkingStartedAt = 0;
let reviewRequired = false;
let indoorSessionUsed = false;
let locationConfidenceScore: number | null = null;
let confidenceDisplayLabel: ConfidenceDisplayLabel | null = null;
let indoorFallbackUsed = false;
let verifyStatusLabel: string | null = null;
let gpsOriginalRadiusM: number | null = null;
let gpsExpandedRadiusM: number | null = null;
let gpsTrustedWindowUsed = false;
let baseRadiusM: number | null = null;
let effectiveRadiusM: number | null = null;
let radiusUsedM: number | null = null;
let indoorVerifyAttempt: IndoorFallbackAttempt | null = null;
let approvalReason: string | null = null;
let stopGpsService: (() => void) | null = null;
let pollId: number | null = null;
let stuckVerifyTimer: number | null = null;
let checkingDeadlineTimer: number | null = null;
let unsubGpsCache: (() => void) | null = null;
let verifyListeners = new Set<() => void>();

let gpsRequestIdCounter = 0;
let activeGpsRequestId = 0;
let refreshInFlight: Promise<void> | null = null;

function verifyLog(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[gps-verify] ${event}`, detail);
  } else {
    console.log(`[gps-verify] ${event}`);
  }
}

function isCurrentGpsRequest(requestId: number): boolean {
  return requestId === activeGpsRequestId;
}

function beginGpsRequest(): number {
  activeGpsRequestId = ++gpsRequestIdCounter;
  return activeGpsRequestId;
}

function buildSnapshot(): ClockGpsVerifySnapshot {
  return {
    phase,
    verifyTier,
    error: verifyError,
    tooFarMessage,
    verified,
    verifiedViaLabel,
    distanceMeters,
    accuracyMeters,
    sampleCount,
    sampleSpreadMeters,
    isCheckingLocation,
    reviewRequired,
    indoorSessionUsed,
    locationConfidenceScore,
    confidenceDisplayLabel,
    indoorFallbackUsed,
    verifyStatusLabel,
    gpsOriginalRadiusM,
    gpsExpandedRadiusM,
    gpsTrustedWindowUsed,
    indoorConfidenceMode: activeShop?.gpsIndoorMode === true,
    baseRadiusM,
    effectiveRadiusM,
    radiusUsedM,
    indoorVerifyAttempt,
    approvalReason,
    confidenceTier: confidenceDisplayLabel
      ? staffGpsConfidenceTier(confidenceDisplayLabel, locationConfidenceScore)
      : null,
  };
}

function snapshotsEqual(a: ClockGpsVerifySnapshot, b: ClockGpsVerifySnapshot): boolean {
  if (a.phase !== b.phase) return false;
  if (a.verifyTier !== b.verifyTier) return false;
  if (a.error !== b.error) return false;
  if (a.tooFarMessage !== b.tooFarMessage) return false;
  if (a.distanceMeters !== b.distanceMeters) return false;
  if (a.accuracyMeters !== b.accuracyMeters) return false;
  if (a.isCheckingLocation !== b.isCheckingLocation) return false;
  if (a.verifiedViaLabel !== b.verifiedViaLabel) return false;
  if (a.sampleCount !== b.sampleCount) return false;
  if (a.sampleSpreadMeters !== b.sampleSpreadMeters) return false;
  if (a.reviewRequired !== b.reviewRequired) return false;
  if (a.indoorSessionUsed !== b.indoorSessionUsed) return false;
  if (a.locationConfidenceScore !== b.locationConfidenceScore) return false;
  if (a.confidenceDisplayLabel !== b.confidenceDisplayLabel) return false;
  if (a.indoorFallbackUsed !== b.indoorFallbackUsed) return false;
  if (a.verifyStatusLabel !== b.verifyStatusLabel) return false;
  const av = a.verified;
  const bv = b.verified;
  if (av === bv) return true;
  if (!av || !bv) return false;
  return (
    av.latitude === bv.latitude &&
    av.longitude === bv.longitude &&
    av.accuracyMeters === bv.accuracyMeters &&
    av.cachedAt === bv.cachedAt &&
    av.distanceMeters === bv.distanceMeters &&
    av.matchedLocationId === bv.matchedLocationId &&
    av.matchedLocationName === bv.matchedLocationName &&
    av.verifyTier === bv.verifyTier
  );
}

function commitSnapshot(next: ClockGpsVerifySnapshot): boolean {
  if (snapshotsEqual(cachedSnapshot, next)) return false;
  cachedSnapshot = next;
  return true;
}

function notifyVerify() {
  if (!commitSnapshot(buildSnapshot())) return;
  for (const fn of verifyListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function phaseFromTier(tier: GpsVerifyTier, spread: number, allowsPunch: boolean): ClockGpsVerifyPhase {
  if (!allowsPunch) {
    if (spread > GPS_UNSTABLE_SPREAD_M) return "unstable";
    return "too_far";
  }
  if (tier === "weak_indoor" || tier === "review_required") return "weak_indoor";
  return "verified";
}

function persistSession(shop: ShopForPunch, v: VerifiedGps): void {
  const session: IndoorGpsSession = {
    shopId: shop.id,
    latitude: v.latitude,
    longitude: v.longitude,
    accuracyMeters: v.accuracyMeters,
    verifyTier: v.verifyTier,
    matchedLocationId: v.matchedLocationId.startsWith("legacy-") ? null : v.matchedLocationId,
    savedAt: Date.now(),
  };
  saveIndoorGpsSession(session);
}

function applyVerificationFromCache(requestId: number) {
  if (!isCurrentGpsRequest(requestId) || !activeShop) return;

  try {
    const prepare = getLocationPrepareSnapshot();
    const fresh = getCachedGpsPosition();
    const cached = fresh ?? getCachedGpsPositionForDisplay();
    const meta = getGpsSampleMeta();

    if (!cached && prepare.status === "error") {
      phase = "error";
      verifyTier = null;
      verifyError = prepare.error ?? GPS_UNAVAILABLE_MSG;
      tooFarMessage = null;
      verified = null;
      verifiedViaLabel = null;
      distanceMeters = null;
      accuracyMeters = null;
      sampleCount = 0;
      sampleSpreadMeters = 0;
      reviewRequired = false;
      indoorSessionUsed = false;
      locationConfidenceScore = null;
      confidenceDisplayLabel = null;
      indoorFallbackUsed = false;
      verifyStatusLabel = null;
      gpsOriginalRadiusM = null;
      gpsExpandedRadiusM = null;
      gpsTrustedWindowUsed = false;
      verifyLog("verify error (no cache)", { error: verifyError });
      notifyVerify();
      return;
    }

    if (!cached) {
      phase = "checking";
      verifyTier = null;
      verifyError = null;
      tooFarMessage = null;
      verified = null;
      verifiedViaLabel = null;
      distanceMeters = null;
      accuracyMeters = null;
      sampleCount = meta.sampleCount;
      sampleSpreadMeters = meta.sampleSpreadMeters;
      reviewRequired = false;
      indoorSessionUsed = false;
      locationConfidenceScore = null;
      confidenceDisplayLabel = null;
      indoorFallbackUsed = false;
      verifyStatusLabel = null;
      gpsOriginalRadiusM = null;
      gpsExpandedRadiusM = null;
      gpsTrustedWindowUsed = false;
      notifyVerify();
      return;
    }

    accuracyMeters = cached.accuracyMeters;
    sampleCount = cached.sampleCount ?? meta.sampleCount;
    sampleSpreadMeters = cached.sampleSpreadMeters ?? meta.sampleSpreadMeters;

    const check = evaluateGpsAgainstShop(cached);
    if (!check) return;

    distanceMeters = check.distanceM;
    verifyTier = check.verifyTier;
    reviewRequired = check.reviewRequired;
    indoorSessionUsed = check.indoorSessionUsed;
    locationConfidenceScore = check.locationConfidenceScore;
    confidenceDisplayLabel = check.confidenceDisplayLabel;
    indoorFallbackUsed = check.indoorFallbackUsed;
    verifyStatusLabel = check.verifyStatusLabel;
    gpsOriginalRadiusM = check.gpsOriginalRadiusM;
    gpsExpandedRadiusM = check.gpsExpandedRadiusM;
    gpsTrustedWindowUsed = check.gpsTrustedWindowUsed;
    baseRadiusM = check.radiusM;
    effectiveRadiusM = check.effectiveRadiusM;
    radiusUsedM = gpsRadiusUsedMeters(check);
    const failCount = activeShop.gpsIndoorMode
      ? getIndoorVerifyFailureCount(activeShop.id, failureStaffId())
      : 0;
    indoorVerifyAttempt =
      check.indoorFallbackAttempt ??
      (activeShop.gpsIndoorMode
        ? indoorVerifyAttemptFromFailureCount(failCount)
        : null);
    approvalReason = gpsResultReasonFromCheck(check);
    verifyLog("distance computed", {
      shopId: activeShop.id,
      indoorMode: activeShop.gpsIndoorMode,
      defaultRadiusM: Math.round(check.radiusM),
      attempt: indoorVerifyAttempt,
      distanceM: Math.round(check.distanceM),
      effectiveRadiusM: Math.round(check.effectiveRadiusM),
      radiusUsedM: radiusUsedM != null ? Math.round(radiusUsedM) : null,
      expandedRadiusM: check.gpsExpandedRadiusM,
      tier: check.verifyTier,
      score: check.locationConfidenceScore,
      confidenceLabel: check.confidenceDisplayLabel,
      allowsPunch: check.allowsPunch,
      fallbackUsed: check.indoorFallbackUsed,
      accuracyM: Math.round(cached.accuracyMeters),
      spreadM: sampleSpreadMeters,
      approvalReason,
      usingStaleDisplay: !fresh && !!cached,
    });

    if (check.allowsPunch) {
      clearCheckingDeadline();
      isCheckingLocation = false;
      checkingStartedAt = 0;
      if (
        activeShop.gpsIndoorMode &&
        (isGoodOrFairLabel(check.confidenceDisplayLabel) || check.indoorFallbackUsed)
      ) {
        pauseClockGpsSampling();
      } else if (!activeShop.gpsIndoorMode) {
        pauseClockGpsSampling();
      }
      const loc = check.matchedLocation;
      phase = phaseFromTier(check.verifyTier, sampleSpreadMeters, true);
      verifyError = null;
      tooFarMessage = null;
      verifiedViaLabel = loc ? formatVerifiedViaLabel(loc.name) : "Location verified";
      verified = {
        ...cached,
        distanceMeters: Math.round(check.distanceM * 100) / 100,
        gpsVerified: true,
        verifyTier: check.verifyTier,
        reviewRequired: check.reviewRequired,
        indoorSessionUsed: check.indoorSessionUsed,
        matchedLocationId: loc?.id ?? `legacy-${activeShop.id}`,
        matchedLocationName: loc?.name ?? "Shop",
        matchedLocationType: loc?.location_type ?? "main",
        sampleCount,
        sampleSpreadMeters,
        locationConfidenceScore: check.locationConfidenceScore,
        confidenceDisplayLabel: check.confidenceDisplayLabel,
        allowsPunch: true,
        indoorFallbackUsed: check.indoorFallbackUsed,
        gpsOriginalRadiusM: check.gpsOriginalRadiusM,
        gpsExpandedRadiusM: check.gpsExpandedRadiusM,
        verifyStatusLabel: check.verifyStatusLabel,
        gpsTrustedWindowUsed: check.gpsTrustedWindowUsed,
        baseRadiusM: check.radiusM,
        effectiveRadiusM: check.effectiveRadiusM,
        radiusUsedM: gpsRadiusUsedMeters(check),
        indoorVerifyAttempt:
          check.indoorFallbackAttempt ??
          (activeShop.gpsIndoorMode
            ? indoorVerifyAttemptFromFailureCount(failCount)
            : null),
        resultReason: gpsResultReasonFromCheck(check),
      };
      if (
        activeShop.gpsIndoorMode &&
        !check.indoorFallbackUsed &&
        check.locationConfidenceScore >= 60
      ) {
        recordTrustedVerification(activeShop.id);
      }
      persistSession(activeShop, verified);
      if (activeShop.gpsIndoorMode) {
        resetIndoorVerifyFailures(activeShop.id, failureStaffId());
      }
    } else {
      phase = phaseFromTier(check.verifyTier, sampleSpreadMeters, false);
      verifyError = null;
      const trust = getTrustedFallbackEligibility(activeShop.id);
      tooFarMessage =
        activeShop.gpsIndoorMode &&
        canUseIndoorRadiusFallback(
          activeShop.gpsIndoorMode,
          cached.accuracyMeters,
          check.locationConfidenceScore,
          trust.eligible,
        )
          ? INDOOR_FALLBACK_FAIL_MSG
          : activeShop.gpsIndoorMode && check.locationConfidenceScore < 30
            ? "Location confidence too low. Tap Refresh Location or move nearer a window."
            : phase === "unstable"
              ? "GPS is unstable indoors. Stay still and tap Refresh Location."
              : TOO_FAR_MSG;
      verified = null;
      verifiedViaLabel = null;
      if (
        activeShop.gpsIndoorMode &&
        !punchAllowedFromCheck(check)
      ) {
        recordIndoorVerifyFailure(activeShop.id, failureStaffId(), requestId);
      }
    }
    notifyVerify();
  } catch (e) {
    phase = "error";
    verifyTier = null;
    verifyError = e instanceof Error ? e.message : "Could not verify location";
    verified = null;
    verifyLog("verify exception", { error: verifyError });
    if (activeShop?.gpsIndoorMode) {
      recordIndoorVerifyFailure(activeShop.id, failureStaffId(), requestId);
    }
    notifyVerify();
  }
}

function isGoodOrFairLabel(label: ConfidenceDisplayLabel | null): boolean {
  return label === "Good" || label === "Fair";
}

function punchAllowedFromCheck(check: {
  allowsPunch: boolean;
  confidenceDisplayLabel: ConfidenceDisplayLabel;
  indoorFallbackUsed: boolean;
}): boolean {
  return (
    check.allowsPunch &&
    (isGoodOrFairLabel(check.confidenceDisplayLabel) || check.indoorFallbackUsed)
  );
}

export function setClockGpsVerifyStaff(staffId: string | null): void {
  activeStaffId = staffId?.trim() ? staffId.trim() : null;
}

function failureStaffId(): string {
  return activeStaffId ?? "";
}

function evaluateGpsAgainstShop(cached: CachedGpsPosition) {
  if (!activeShop) return null;
  const meta = getGpsSampleMeta();
  const sampleCount = cached.sampleCount ?? meta.sampleCount;
  const sampleSpreadMeters = cached.sampleSpreadMeters ?? meta.sampleSpreadMeters;
  const session = activeShop.gpsIndoorMode ? readIndoorGpsSession(activeShop.id) : null;
  const trust = activeShop.gpsIndoorMode
    ? getTrustedFallbackEligibility(activeShop.id)
    : { eligible: false };
  const failCount = activeShop.gpsIndoorMode
    ? getIndoorVerifyFailureCount(activeShop.id, failureStaffId())
    : 0;
  const indoorVerifyAttempt = indoorVerifyAttemptFromFailureCount(failCount);
  return checkGpsAgainstLocations(
    activeShop.locations,
    cached.latitude,
    cached.longitude,
    cached.accuracyMeters,
    {
      sampleCount,
      sampleSpreadM: sampleSpreadMeters,
      indoorSession: session,
      shopIndoorMode: activeShop.gpsIndoorMode,
      trustedDeviceFallback: trust.eligible,
      indoorVerifyAttempt,
    },
  );
}

/** Called after each GPS sample — stop acquisition when Good/Fair punch is allowed. */
function tryEarlyStopGpsSampling(): boolean {
  if (!activeShop) return false;
  const cached = getCachedGpsPosition() ?? getCachedGpsPositionForDisplay();
  if (!cached) return false;

  const check = evaluateGpsAgainstShop(cached);
  if (!check) return false;

  if (activeShop.gpsIndoorMode && punchAllowedFromCheck(check)) {
    applyVerificationFromCache(activeGpsRequestId);
    pauseClockGpsSampling();
    verifyLog("early stop — punch allowed", {
      label: check.confidenceDisplayLabel,
      score: check.locationConfidenceScore,
      samples: check.sampleCount,
    });
    return true;
  }
  return false;
}

function recomputeVerification() {
  if (!activeShop) return;
  applyVerificationFromCache(activeGpsRequestId);
}

function onGpsCacheUpdate() {
  if (verified && isGpsVerifiedForPunch()) {
    if (!activeShop?.gpsIndoorMode) return;
    if (isGoodOrFairLabel(confidenceDisplayLabel) || indoorFallbackUsed) return;
  }
  applyVerificationFromCache(activeGpsRequestId);
}

function clearCheckingDeadline() {
  if (checkingDeadlineTimer != null) {
    window.clearTimeout(checkingDeadlineTimer);
    checkingDeadlineTimer = null;
  }
}

function armCheckingDeadline() {
  clearCheckingDeadline();
  checkingDeadlineTimer = window.setTimeout(() => {
    if (!activeShop) return;
    applyVerificationFromCache(activeGpsRequestId);
    if (phase === "checking" || (!verified && phase !== "too_far" && phase !== "unstable")) {
      if (!getCachedGpsPositionForDisplay()) {
        phase = "error";
        verifyTier = null;
        verifyError = GPS_CHECKING_TIMEOUT_MSG;
        verified = null;
        verifyLog("checking deadline — no fix", { ms: checkingDeadlineMs() });
        notifyVerify();
      } else if (!isGpsVerifiedForPunch()) {
        verifyError = GPS_CHECKING_TIMEOUT_MSG;
        verifyLog("checking deadline — not verified yet", { ms: checkingDeadlineMs() });
        if (activeShop.gpsIndoorMode) {
          recordIndoorVerifyFailure(activeShop.id, failureStaffId(), activeGpsRequestId);
        }
        notifyVerify();
      }
    }
    isCheckingLocation = false;
    checkingStartedAt = 0;
    notifyVerify();
  }, checkingDeadlineMs());
}

function checkVerificationStuck() {
  if (!activeShop) return;

  const now = Date.now();

  if (isCheckingLocation && checkingStartedAt > 0 && now - checkingStartedAt > checkingDeadlineMs()) {
    verifyLog("checking deadline — finalize with best fix");
    isCheckingLocation = false;
    checkingStartedAt = 0;
    applyVerificationFromCache(activeGpsRequestId);
    if (phase === "checking") {
      verifyError = GPS_CHECKING_TIMEOUT_MSG;
      notifyVerify();
    }
  }
}

export function subscribeClockGpsVerify(listener: () => void): () => void {
  verifyListeners.add(listener);
  return () => verifyListeners.delete(listener);
}

export function getClockGpsVerifySnapshot(): ClockGpsVerifySnapshot {
  return cachedSnapshot;
}

export function getClockGpsVerifyServerSnapshot(): ClockGpsVerifySnapshot {
  return INITIAL_SNAPSHOT;
}

export function isGpsVerifiedForPunch(): boolean {
  if (!verified) return false;
  if (!activeShop?.gpsIndoorMode) return verified.allowsPunch;
  if (verified.indoorFallbackUsed) return true;
  if (verified.allowsPunch && isGoodOrFairLabel(verified.confidenceDisplayLabel)) return true;
  return allowsPunchFromScore(verified.locationConfidenceScore);
}

export function shouldOfferLocationRefresh(snap: ClockGpsVerifySnapshot): boolean {
  if (snap.isCheckingLocation) return true;
  if (snap.phase === "too_far" || snap.phase === "error" || snap.phase === "unstable") return true;
  if (snap.phase === "checking") return true;
  if (
    snap.accuracyMeters != null &&
    Number.isFinite(snap.accuracyMeters) &&
    snap.accuracyMeters > GPS_WEAK_ACCURACY_METERS
  ) {
    return true;
  }
  if (snap.phase === "weak_indoor" || snap.reviewRequired) return true;
  return false;
}

export function getVerifiedGpsForPunch(): VerifiedGps {
  if (!verified || !isGpsVerifiedForPunch()) {
    throw new Error("Location is not verified. Wait until you are within shop range.");
  }
  return verified;
}

/**
 * Manual refresh — always restarts GPS (supersedes in-flight refresh).
 */
export function refreshClockGpsVerification(): Promise<void> {
  if (typeof window === "undefined" || !activeShop) {
    return Promise.resolve();
  }

  const requestId = beginGpsRequest();
  verifyLog("refresh start (full restart)", { requestId });

  resumeClockGpsSampling();
  refreshInFlight = null;
  isCheckingLocation = true;
  checkingStartedAt = Date.now();
  phase = "checking";
  verifyTier = null;
  verifyError = null;
  tooFarMessage = null;
  verified = null;
  verifiedViaLabel = null;
  distanceMeters = null;
  accuracyMeters = null;
  notifyVerify();

  armCheckingDeadline();

  refreshInFlight = (async () => {
    try {
      await forceRefreshGpsPosition();

      if (!isCurrentGpsRequest(requestId)) {
        verifyLog("refresh stale (superseded)", { requestId });
        return;
      }

      applyVerificationFromCache(requestId);

      const snap = getClockGpsVerifySnapshot();
      verifyLog("refresh done", {
        requestId,
        phase: snap.phase,
        tier: snap.verifyTier,
        distance: snap.distanceMeters,
        accuracy: snap.accuracyMeters,
        spread: snap.sampleSpreadMeters,
      });
    } catch (e) {
      if (!isCurrentGpsRequest(requestId)) return;

      phase = "error";
      verifyTier = null;
      verifyError = e instanceof Error ? e.message : GPS_UNAVAILABLE_MSG;
      tooFarMessage = null;
      verified = null;
      verifyLog("refresh failed", {
        requestId,
        error: verifyError,
      });
      if (activeShop?.gpsIndoorMode) {
        recordIndoorVerifyFailure(activeShop.id, failureStaffId(), requestId);
      }
      notifyVerify();
    } finally {
      if (isCurrentGpsRequest(requestId)) {
        isCheckingLocation = false;
        checkingStartedAt = 0;
        clearCheckingDeadline();
        notifyVerify();
      }
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Start GPS + shop distance verification. Always restarts service (page reopen safe).
 */
export function startClockGpsVerification(shop: ShopForPunch): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (stopGpsService) {
    stopGpsService();
    stopGpsService = null;
  }
  if (unsubGpsCache) {
    unsubGpsCache();
    unsubGpsCache = null;
  }
  if (pollId != null) {
    window.clearInterval(pollId);
    pollId = null;
  }
  if (stuckVerifyTimer != null) {
    window.clearInterval(stuckVerifyTimer);
    stuckVerifyTimer = null;
  }

  beginGpsRequest();
  activeShop = shop;
  phase = "checking";
  verifyTier = null;
  verifyError = null;
  tooFarMessage = null;
  verified = null;
  verifiedViaLabel = null;
  isCheckingLocation = false;
  checkingStartedAt = 0;
  refreshInFlight = null;
  notifyVerify();

  const primaryRadius =
    shop.locations[0]?.allowed_radius_meters ?? null;
  verifyLog("shop GPS settings loaded", {
    shopId: shop.id,
    indoorMode: shop.gpsIndoorMode === true,
    locationCount: shop.locations.length,
    defaultRadiusM: primaryRadius,
    locations: shop.locations.map((l) => ({
      name: l.name,
      radiusM: l.allowed_radius_meters,
      type: l.location_type,
    })),
  });

  resumeClockGpsSampling();
  if (shop.gpsIndoorMode) {
    setGpsEarlyStopListener(tryEarlyStopGpsSampling);
  } else {
    setGpsEarlyStopListener(null);
  }
  armCheckingDeadline();
  stopGpsService = startPreparedLocationService({
    indoorConfidenceMode: shop.gpsIndoorMode === true,
  });
  unsubGpsCache = subscribeGpsCache(onGpsCacheUpdate);
  recomputeVerification();

  pollId = window.setInterval(() => {
    recomputeVerification();
  }, shop.gpsIndoorMode ? 1000 : 500);

  if (shop.gpsIndoorMode) {
    stuckVerifyTimer = window.setInterval(checkVerificationStuck, 3000);
  }

  return () => {
    clearCheckingDeadline();
    setGpsEarlyStopListener(null);
    resumeClockGpsSampling();
    if (pollId != null) window.clearInterval(pollId);
    pollId = null;
    if (stuckVerifyTimer != null) window.clearInterval(stuckVerifyTimer);
    stuckVerifyTimer = null;
    unsubGpsCache?.();
    unsubGpsCache = null;
    if (stopGpsService) {
      stopGpsService();
      stopGpsService = null;
    }
    activeShop = null;
    activeStaffId = null;
    verified = null;
    phase = "checking";
    isCheckingLocation = false;
    checkingStartedAt = 0;
    refreshInFlight = null;
    commitSnapshot(INITIAL_SNAPSHOT);
    notifyVerify();
    verifyLog("clock GPS verification stopped");
  };
}
