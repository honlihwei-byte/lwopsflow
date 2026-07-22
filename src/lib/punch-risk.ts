import { GPS_WEAK_ACCURACY_THRESHOLD_M } from "@/lib/gps-shop-verify";
import { isPhotoProofMethod } from "@/lib/verification-method";

export type RiskLevel = "low" | "medium" | "high";

export type RiskFlag =
  | "new_device"
  | "device_mismatch"
  | "buddy_punch"
  | "weak_gps"
  | "photo_proof"
  | "different_shop_short_time"
  | "random_selfie";

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  new_device: "New Device Detected",
  device_mismatch: "Device Mismatch",
  buddy_punch: "Potential Buddy Punch",
  weak_gps: "Weak GPS",
  photo_proof: "Photo Proof",
  different_shop_short_time: "Different Shop (short time)",
  random_selfie: "Random Selfie",
};

export const RISK_SCORE_WEIGHTS: Record<RiskFlag, number> = {
  new_device: 20,
  device_mismatch: 30,
  buddy_punch: 50,
  weak_gps: 15,
  photo_proof: 10,
  different_shop_short_time: 40,
  random_selfie: 0,
};

export type PunchRiskInput = {
  newDevice: boolean;
  deviceMismatch: boolean;
  buddyPunch: boolean;
  weakGps: boolean;
  photoProof: boolean;
  differentShopShortTime: boolean;
  randomSelfie: boolean;
};

export function riskFlagsFromInput(input: PunchRiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.newDevice) flags.push("new_device");
  if (input.deviceMismatch) flags.push("device_mismatch");
  if (input.buddyPunch) flags.push("buddy_punch");
  if (input.weakGps) flags.push("weak_gps");
  if (input.photoProof) flags.push("photo_proof");
  if (input.differentShopShortTime) flags.push("different_shop_short_time");
  if (input.randomSelfie) flags.push("random_selfie");
  return flags;
}

export function calculateRiskScore(flags: RiskFlag[]): number {
  let score = 0;
  for (const f of flags) {
    score += RISK_SCORE_WEIGHTS[f] ?? 0;
  }
  return Math.min(100, score);
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

export function isWeakGpsAccuracy(accuracyM: number | null | undefined): boolean {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return false;
  return accuracyM > GPS_WEAK_ACCURACY_THRESHOLD_M;
}

export function parseRiskFlagsJson(raw: unknown): RiskFlag[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(Object.keys(RISK_SCORE_WEIGHTS));
  return raw.filter((x): x is RiskFlag => typeof x === "string" && allowed.has(x));
}

export function attendanceHasPhotoProofRisk(
  photoProofUsed: boolean | null | undefined,
  verificationMethod: string | null | undefined,
): boolean {
  return photoProofUsed === true || isPhotoProofMethod(verificationMethod);
}
