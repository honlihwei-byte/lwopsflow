import {
  shopVerificationIncludesSelfie,
  type ShopAntiBuddySettings,
} from "@/lib/shop-anti-buddy";
import type { SelfieProofMode } from "@/lib/selfie-proof-policy";

/** Shop Security panel: how often staff must take a selfie when verification is on. */
export type ShopSelfieFrequency =
  | "disabled"
  | "clock_in_only"
  | "clock_in_out"
  | "every_punch"
  | "random_50"
  | "random_30"
  | "random_20"
  | "random_10";

export type SelfieRandomPercent = 0 | 5 | 10 | 20 | 30 | 50;

export const DEFAULT_SHOP_SELFIE_FREQUENCY: ShopSelfieFrequency = "clock_in_only";

export const SHOP_SELFIE_FREQUENCY_OPTIONS: {
  value: ShopSelfieFrequency;
  label: string;
}[] = [
  { value: "clock_in_only", label: "Clock In only" },
  { value: "clock_in_out", label: "Clock In & Clock Out" },
  { value: "every_punch", label: "Every punch" },
  { value: "random_50", label: "50% random" },
  { value: "random_30", label: "30% random" },
  { value: "random_20", label: "20% random" },
  { value: "random_10", label: "10% random" },
  { value: "disabled", label: "Disabled" },
];

export function normalizeShopSelfieFrequency(value: unknown): ShopSelfieFrequency {
  const v = String(value ?? "");
  if (
    v === "clock_in_only" ||
    v === "clock_in_out" ||
    v === "every_punch" ||
    v === "random_50" ||
    v === "random_30" ||
    v === "random_20" ||
    v === "random_10" ||
    v === "disabled"
  ) {
    return v;
  }
  return "disabled";
}

export function normalizeSelfieRandomPercent(value: unknown): SelfieRandomPercent {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 5 || n === 10 || n === 20 || n === 30 || n === 50) return n;
  return 0;
}

export function selfieFrequencyFromShop(shop: ShopAntiBuddySettings): ShopSelfieFrequency {
  if (!shopVerificationIncludesSelfie(shop.attendance_verification_mode)) {
    return "disabled";
  }
  const mode = shop.selfie_proof_mode;
  if (mode === "off") return "disabled";
  if (mode === "clock_in_only") return "clock_in_only";
  if (mode === "clock_in_out") return "clock_in_out";
  if (mode == null || mode === "always" || mode === "risk") return "every_punch";
  if (mode === "random") {
    const p = normalizeSelfieRandomPercent(shop.selfie_proof_random_percent);
    if (p === 50) return "random_50";
    if (p === 30) return "random_30";
    if (p === 20) return "random_20";
    if (p === 10) return "random_10";
    return "random_10";
  }
  return "disabled";
}

export function applySelfieFrequencyToShopFields(
  frequency: ShopSelfieFrequency,
): Pick<ShopAntiBuddySettings, "selfie_proof_mode" | "selfie_proof_random_percent"> {
  switch (frequency) {
    case "clock_in_only":
      return { selfie_proof_mode: "clock_in_only", selfie_proof_random_percent: null };
    case "clock_in_out":
      return { selfie_proof_mode: "clock_in_out", selfie_proof_random_percent: null };
    case "every_punch":
      return { selfie_proof_mode: "always", selfie_proof_random_percent: null };
    case "random_50":
      return { selfie_proof_mode: "random", selfie_proof_random_percent: 50 };
    case "random_30":
      return { selfie_proof_mode: "random", selfie_proof_random_percent: 30 };
    case "random_20":
      return { selfie_proof_mode: "random", selfie_proof_random_percent: 20 };
    case "random_10":
      return { selfie_proof_mode: "random", selfie_proof_random_percent: 10 };
    case "disabled":
    default:
      return { selfie_proof_mode: "off", selfie_proof_random_percent: null };
  }
}

export type ResolvedShopSelfiePolicy = {
  frequency: ShopSelfieFrequency;
  mode: SelfieProofMode;
  randomPercent: SelfieRandomPercent;
};

/** Effective selfie policy for punch precheck (shop security settings). */
export function resolveShopSelfieProofPolicy(
  shop: ShopAntiBuddySettings,
): ResolvedShopSelfiePolicy {
  const frequency = selfieFrequencyFromShop(shop);
  if (!shopVerificationIncludesSelfie(shop.attendance_verification_mode)) {
    return { frequency: "disabled", mode: "off", randomPercent: 0 };
  }
  if (frequency === "disabled") {
    return { frequency, mode: "off", randomPercent: 0 };
  }
  if (frequency === "clock_in_only") {
    return { frequency, mode: "clock_in_only", randomPercent: 0 };
  }
  if (frequency === "clock_in_out") {
    return { frequency, mode: "clock_in_out", randomPercent: 0 };
  }
  if (frequency === "every_punch") {
    return { frequency, mode: "always", randomPercent: 0 };
  }
  const pct =
    frequency === "random_50"
      ? 50
      : frequency === "random_30"
        ? 30
        : frequency === "random_20"
          ? 20
          : 10;
  return { frequency, mode: "random", randomPercent: pct };
}
