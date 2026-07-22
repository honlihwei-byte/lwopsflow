"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getClockGpsVerifyServerSnapshot,
  getClockGpsVerifySnapshot,
  refreshClockGpsVerification,
  subscribeClockGpsVerify,
} from "@/lib/clock-verified-gps";
import { GPS_CHECKING_TIMEOUT_MSG, GPS_UNAVAILABLE_MSG } from "@/lib/geolocation-client";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateEmployeeStatus, type EmployeeTranslateFn } from "@/lib/i18n/employee-translate";

function cardTone(
  canPunch: boolean,
  locationWarning: boolean,
  phase: string,
  errorMessage: string | null,
): "approved" | "warning" | "retry" | "checking" {
  if (canPunch && locationWarning) return "warning";
  if (canPunch) return "approved";
  if (
    phase === "error" ||
    phase === "too_far" ||
    (errorMessage && errorMessage !== GPS_UNAVAILABLE_MSG)
  ) {
    return "retry";
  }
  return "checking";
}

function cardStyles(tone: "approved" | "warning" | "retry" | "checking"): string {
  switch (tone) {
    case "approved":
      return "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "retry":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100";
  }
}

function badgeClass(tone: "approved" | "warning" | "retry" | "checking"): string {
  switch (tone) {
    case "approved":
      return "border-teal-300/60 bg-teal-100/80 text-teal-900 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100";
    case "warning":
      return "border-amber-300/60 bg-amber-100/80 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100";
    case "retry":
      return "border-red-300/60 bg-red-100/80 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100";
    default:
      return "border-blue-300/60 bg-blue-100/80 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100";
  }
}

function staffHeadline(
  t: EmployeeTranslateFn,
  canPunch: boolean,
  locationWarning: boolean,
  isAcquiring: boolean,
  phase: string,
  errorMessage: string | null,
): string {
  if (errorMessage === GPS_CHECKING_TIMEOUT_MSG) {
    return t("employee.location.stillChecking");
  }
  if (canPunch && locationWarning) return t("employee.location.warning");
  if (canPunch) return translateEmployeeStatus(t, "location_approved");
  if (isAcquiring) return t("employee.location.checking");
  if (phase === "too_far" || phase === "error") {
    return translateEmployeeStatus(t, "location_unavailable");
  }
  return t("employee.location.checking");
}

function staffSubline(
  t: EmployeeTranslateFn,
  canPunch: boolean,
  locationWarning: boolean,
  isAcquiring: boolean,
  phase: string,
): string {
  if (canPunch && locationWarning) {
    return t("employee.location.weakGpsHint");
  }
  if (canPunch) return t("employee.location.canPunch");
  if (isAcquiring) return t("employee.location.allowPermission");
  if (phase === "too_far" || phase === "error") {
    return t("employee.location.moveCloser");
  }
  return t("employee.location.allowPermission");
}

function formatMeters(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}m`;
}

/** Staff clock page — friendly location status with optional technical details. */
export function LocationStatusCard({
  indoorAttemptLabel,
}: {
  indoorAttemptLabel?: string | null;
}) {
  const { t } = useI18n();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const snap = useSyncExternalStore(
    subscribeClockGpsVerify,
    getClockGpsVerifySnapshot,
    getClockGpsVerifyServerSnapshot,
  );

  const {
    phase,
    error,
    isCheckingLocation,
    confidenceDisplayLabel,
    indoorFallbackUsed,
    indoorConfidenceMode,
    reviewRequired,
  } = snap;

  const label = confidenceDisplayLabel;
  const canPunch = indoorConfidenceMode
    ? indoorFallbackUsed ||
      (label != null &&
        (label === "Good" || label === "Fair") &&
        (snap.locationConfidenceScore == null || snap.locationConfidenceScore >= 60))
    : phase === "verified" || phase === "weak_indoor";

  const locationWarning =
    canPunch &&
    (reviewRequired ||
      indoorFallbackUsed ||
      label === "Weak" ||
      snap.confidenceTier === "Low");

  const isAcquiring = (isCheckingLocation || phase === "checking") && !canPunch;
  const actionDisabled = isCheckingLocation && canPunch;
  const tone = cardTone(canPunch, locationWarning, phase, error);

  const handleAction = useCallback(() => {
    if (actionDisabled) return;
    void refreshClockGpsVerification();
  }, [actionDisabled]);

  const showDetails =
    canPunch &&
    (snap.distanceMeters != null ||
      snap.accuracyMeters != null ||
      snap.radiusUsedM != null ||
      snap.confidenceTier != null);

  return (
    <section
      className={`rounded-xl border px-4 py-3 text-sm ${cardStyles(tone)}`}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {staffHeadline(t, canPunch, locationWarning, isAcquiring, phase, error)}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {staffSubline(t, canPunch, locationWarning, isAcquiring, phase)}
          </p>
        </div>
        {!isAcquiring ? (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass(tone)}`}
          >
            {canPunch
              ? locationWarning
                ? t("employee.location.badgeReview")
                : translateEmployeeStatus(t, "location_approved")
              : tone === "retry"
                ? t("employee.location.badgeRetry")
                : t("employee.location.badgeChecking")}
          </span>
        ) : null}
      </div>

      {showDetails ? (
        <div className="mt-3 border-t border-current/15 pt-3">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="text-xs font-semibold underline opacity-90"
          >
            {detailsOpen ? "Hide location details" : "Show location details"}
          </button>
          {detailsOpen ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] opacity-95">
              <dt className="text-current/70">Distance</dt>
              <dd className="font-medium">{formatMeters(snap.distanceMeters)}</dd>
              <dt className="text-current/70">Accuracy</dt>
              <dd className="font-medium">
                {snap.accuracyMeters != null ? `±${formatMeters(snap.accuracyMeters)}` : "—"}
              </dd>
              <dt className="text-current/70">Radius used</dt>
              <dd className="font-medium">{formatMeters(snap.radiusUsedM)}</dd>
              {snap.baseRadiusM != null &&
              snap.radiusUsedM != null &&
              snap.radiusUsedM > snap.baseRadiusM ? (
                <>
                  <dt className="text-current/70">Default radius</dt>
                  <dd className="font-medium">{formatMeters(snap.baseRadiusM)}</dd>
                </>
              ) : null}
              <dt className="text-current/70">GPS confidence</dt>
              <dd className="font-medium">{snap.confidenceTier ?? "—"}</dd>
              {indoorAttemptLabel ? (
                <>
                  <dt className="text-current/70">Verify attempt</dt>
                  <dd className="col-span-1 font-medium">{indoorAttemptLabel}</dd>
                </>
              ) : snap.indoorVerifyAttempt != null ? (
                <>
                  <dt className="text-current/70">Verify attempt</dt>
                  <dd className="font-medium">{snap.indoorVerifyAttempt} / 3</dd>
                </>
              ) : null}
              {snap.approvalReason ? (
                <>
                  <dt className="text-current/70">Result</dt>
                  <dd className="col-span-1 font-medium">{snap.approvalReason}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={actionDisabled}
        onClick={handleAction}
        className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed ${
          canPunch
            ? "border-teal-600/40 bg-teal-600/10 text-teal-800 dark:text-teal-100"
            : "border-current/30 bg-white/60 hover:bg-white/90 dark:bg-black/20 dark:hover:bg-black/30"
        } disabled:opacity-60`}
      >
        {isAcquiring ? t("employee.location.gettingLocation") : t("employee.location.refreshLocation")}
      </button>
    </section>
  );
}
