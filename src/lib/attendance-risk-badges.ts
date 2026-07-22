import type { AttendanceRecord } from "@/lib/attendance";
import { parseRiskFlagsJson, type RiskFlag } from "@/lib/punch-risk";
import { isRandomSelfieMethod, isSelfieProofMethod } from "@/lib/verification-method";

export type RiskBadgeType =
  | "trusted_device"
  | "new_device"
  | "device_mismatch"
  | "buddy_punch"
  | "weak_gps"
  | "random_selfie"
  | "selfie_proof"
  | "high_risk";

export const RISK_BADGE_LABELS: Record<RiskBadgeType, string> = {
  trusted_device: "Trusted Device",
  new_device: "New Device Detected",
  device_mismatch: "Device Mismatch",
  buddy_punch: "Potential Buddy Punch",
  weak_gps: "Weak GPS",
  random_selfie: "Random Selfie",
  selfie_proof: "Selfie Proof",
  high_risk: "High Risk",
};

const PROBLEM_BADGES: RiskBadgeType[] = [
  "new_device",
  "device_mismatch",
  "buddy_punch",
  "weak_gps",
  "high_risk",
];

export function riskBadgesForRecord(record: AttendanceRecord): RiskBadgeType[] {
  const badges: RiskBadgeType[] = [];
  const flags = parseRiskFlagsJson(record.risk_flags);

  if (flags.includes("device_mismatch")) badges.push("device_mismatch");
  if (flags.includes("new_device") || record.device_trust_status === "new_device") {
    badges.push("new_device");
  }
  if (record.buddy_punch_flag || flags.includes("buddy_punch")) {
    badges.push("buddy_punch");
  }
  if (flags.includes("weak_gps")) {
    badges.push("weak_gps");
  }
  if (flags.includes("random_selfie") || isRandomSelfieMethod(record.verification_method)) {
    badges.push("random_selfie");
  }
  if (record.selfie_proof_used || isSelfieProofMethod(record.verification_method)) {
    badges.push("selfie_proof");
  }
  if (record.risk_level === "high" || (record.risk_score ?? 0) >= 61) {
    badges.push("high_risk");
  }

  const hasProblem = badges.some((b) => PROBLEM_BADGES.includes(b));
  if (!hasProblem && record.device_trust_status === "trusted") {
    badges.unshift("trusted_device");
  }

  return [...new Set(badges)];
}

export function riskBadgesForRows(rows: AttendanceRecord[]): RiskBadgeType[] {
  const set = new Set<RiskBadgeType>();
  for (const r of rows) {
    for (const b of riskBadgesForRecord(r)) set.add(b);
  }

  const list = [...set];
  const hasProblem = list.some((b) => PROBLEM_BADGES.includes(b));
  if (hasProblem) {
    return list.filter((b) => b !== "trusted_device");
  }
  return list;
}

export function riskFlagsForRows(rows: AttendanceRecord[]): RiskFlag[] {
  const set = new Set<RiskFlag>();
  for (const r of rows) {
    for (const f of parseRiskFlagsJson(r.risk_flags)) set.add(f);
  }
  return [...set];
}
