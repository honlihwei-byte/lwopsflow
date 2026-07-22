import type { ClockGpsVerifySnapshot } from "@/lib/clock-verified-gps";

/** Human-readable GPS line for photo proof overlay (e.g. "GPS: Weak Indoor"). */
export function formatPhotoProofGpsStatus(snap: ClockGpsVerifySnapshot): string {
  if (snap.indoorFallbackUsed) return "GPS: Expanded Radius";
  if (snap.confidenceDisplayLabel) return `GPS: ${snap.confidenceDisplayLabel}`;
  if (snap.verifyStatusLabel) return `GPS: ${snap.verifyStatusLabel}`;
  if (snap.tooFarMessage) return `GPS: ${snap.tooFarMessage}`;
  if (snap.error) return `GPS: ${snap.error}`;
  switch (snap.phase) {
    case "verified":
      return "GPS: Verified";
    case "weak_indoor":
      return "GPS: Weak Indoor";
    case "too_far":
      return "GPS: Outside range";
    case "unstable":
      return "GPS: Unstable";
    case "error":
      return "GPS: Unavailable";
    default:
      return "GPS: Not verified";
  }
}
