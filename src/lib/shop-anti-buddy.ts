import {
  fetchCompanyAntiBuddySettings,
  type AntiBuddyCompanySettings,
} from "@/lib/company-anti-buddy";
import { isMissingColumnError, missingColumnName } from "@/lib/company-security-db";
import {
  normalizeSelfiePercent,
  normalizeSelfieProofMode,
  type SelfieProofMode,
  type SelfieRandomPercent,
} from "@/lib/selfie-proof-policy";
import { resolveShopSelfieProofPolicy } from "@/lib/shop-selfie-frequency";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type AttendanceVerificationMode =
  | "gps_only"
  | "gps_selfie"
  | "gps_location_proof"
  | "gps_selfie_location_proof";

export type ShopAntiBuddySettings = {
  attendance_verification_mode: AttendanceVerificationMode;
  anti_buddy_detect_new_device: boolean;
  anti_buddy_detect_device_mismatch: boolean;
  anti_buddy_detect_shared_device: boolean;
  anti_buddy_flag_rapid_punches: boolean;
  anti_buddy_require_review_high_risk: boolean;
  selfie_proof_mode: SelfieProofMode | null;
  selfie_proof_random_percent: SelfieRandomPercent | null;
  device_enforcement_mode: AntiBuddyCompanySettings["device_enforcement_mode"] | null;
  security_weak_gps_alert: boolean;
};

export const ATTENDANCE_VERIFICATION_LABELS: Record<AttendanceVerificationMode, string> = {
  gps_only: "GPS Only",
  gps_selfie: "GPS + Selfie",
  gps_location_proof: "GPS + Location Proof",
  gps_selfie_location_proof: "GPS + Selfie + Location Proof",
};

export const SHOP_ANTI_BUDDY_SELECT_BASE =
  "attendance_verification_mode, anti_buddy_detect_new_device, anti_buddy_detect_device_mismatch, anti_buddy_detect_shared_device, anti_buddy_flag_rapid_punches, anti_buddy_require_review_high_risk, selfie_proof_mode, selfie_proof_random_percent, device_enforcement_mode" as const;

export const SHOP_ANTI_BUDDY_SELECT =
  `${SHOP_ANTI_BUDDY_SELECT_BASE}, security_weak_gps_alert` as const;

export const DEFAULT_SHOP_ANTI_BUDDY: ShopAntiBuddySettings = {
  attendance_verification_mode: "gps_only",
  anti_buddy_detect_new_device: true,
  anti_buddy_detect_device_mismatch: true,
  anti_buddy_detect_shared_device: true,
  anti_buddy_flag_rapid_punches: true,
  anti_buddy_require_review_high_risk: true,
  selfie_proof_mode: null,
  selfie_proof_random_percent: null,
  device_enforcement_mode: null,
  security_weak_gps_alert: false,
};

export function normalizeAttendanceVerificationMode(value: unknown): AttendanceVerificationMode {
  const v = String(value ?? "gps_only");
  if (
    v === "gps_selfie" ||
    v === "gps_location_proof" ||
    v === "gps_selfie_location_proof"
  ) {
    return v;
  }
  return "gps_only";
}

export function shopAntiBuddyFromRow(row: Record<string, unknown>): ShopAntiBuddySettings {
  const modeRaw = row.selfie_proof_mode;
  const pctRaw = row.selfie_proof_random_percent;
  const deviceRaw = row.device_enforcement_mode;

  let device_enforcement_mode: ShopAntiBuddySettings["device_enforcement_mode"] = null;
  if (deviceRaw === "require_approval" || deviceRaw === "block_unknown") {
    device_enforcement_mode = deviceRaw;
  } else if (deviceRaw === "allow_warn") {
    device_enforcement_mode = "allow_warn";
  }

  return {
    attendance_verification_mode: normalizeAttendanceVerificationMode(
      row.attendance_verification_mode,
    ),
    anti_buddy_detect_new_device: row.anti_buddy_detect_new_device !== false,
    anti_buddy_detect_device_mismatch: row.anti_buddy_detect_device_mismatch !== false,
    anti_buddy_detect_shared_device: row.anti_buddy_detect_shared_device !== false,
    anti_buddy_flag_rapid_punches: row.anti_buddy_flag_rapid_punches !== false,
    anti_buddy_require_review_high_risk: row.anti_buddy_require_review_high_risk !== false,
    selfie_proof_mode:
      modeRaw == null || modeRaw === ""
        ? null
        : normalizeSelfieProofMode(modeRaw),
    selfie_proof_random_percent:
      pctRaw == null || pctRaw === ""
        ? null
        : normalizeSelfiePercent(pctRaw),
    device_enforcement_mode,
    security_weak_gps_alert: row.security_weak_gps_alert === true,
  };
}

export async function fetchShopAntiBuddySettings(
  supabase: Supabase,
  shopId: string,
): Promise<ShopAntiBuddySettings | null> {
  let result = await supabase
    .from("shops")
    .select(SHOP_ANTI_BUDDY_SELECT)
    .eq("id", shopId)
    .maybeSingle();

  if (
    result.error &&
    isMissingColumnError(result.error) &&
    (missingColumnName(result.error) === "security_weak_gps_alert" ||
      missingColumnName(result.error) === "device_enforcement_mode")
  ) {
    result = await supabase
      .from("shops")
      .select(SHOP_ANTI_BUDDY_SELECT_BASE)
      .eq("id", shopId)
      .maybeSingle();
  }

  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return shopAntiBuddyFromRow(result.data as Record<string, unknown>);
}

export function shopVerificationIncludesSelfie(mode: AttendanceVerificationMode): boolean {
  return mode === "gps_selfie" || mode === "gps_selfie_location_proof";
}

export function shopVerificationIncludesLocationProof(mode: AttendanceVerificationMode): boolean {
  return mode === "gps_location_proof" || mode === "gps_selfie_location_proof";
}

/** Sync allow_photo_proof_fallback from verification mode when saving shop anti-buddy settings. */
export function photoProofFallbackForVerificationMode(
  mode: AttendanceVerificationMode,
): boolean {
  return shopVerificationIncludesLocationProof(mode);
}

export type EffectiveShopAntiBuddy = ShopAntiBuddySettings & {
  company: AntiBuddyCompanySettings | null;
  effective_selfie_proof_mode: SelfieProofMode;
  effective_selfie_proof_random_percent: SelfieRandomPercent;
  effective_device_enforcement_mode: AntiBuddyCompanySettings["device_enforcement_mode"];
};

export async function resolveEffectiveShopAntiBuddy(
  supabase: Supabase,
  shopId: string,
  companyId: string | null,
): Promise<EffectiveShopAntiBuddy | null> {
  const shop = await fetchShopAntiBuddySettings(supabase, shopId);
  if (!shop) return null;

  const company = companyId
    ? await fetchCompanyAntiBuddySettings(supabase, companyId)
    : null;

  const selfiePolicy = resolveShopSelfieProofPolicy(shop);
  const effective_selfie_proof_mode = selfiePolicy.mode;
  const effective_selfie_proof_random_percent = selfiePolicy.randomPercent;

  const effective_device_enforcement_mode =
    shop.device_enforcement_mode ?? company?.device_enforcement_mode ?? "allow_warn";

  return {
    ...shop,
    company,
    effective_selfie_proof_mode,
    effective_selfie_proof_random_percent,
    effective_device_enforcement_mode,
  };
}

export type ShopRiskControlFlags = {
  detectNewDevice: boolean;
  detectDeviceMismatch: boolean;
  detectSharedDevice: boolean;
  flagRapidPunches: boolean;
  requireReviewHighRisk: boolean;
  weakGpsDetectionEnabled: boolean;
};

export function riskControlsFromShop(shop: ShopAntiBuddySettings): ShopRiskControlFlags {
  return {
    detectNewDevice: shop.anti_buddy_detect_new_device,
    detectDeviceMismatch: shop.anti_buddy_detect_device_mismatch,
    detectSharedDevice: shop.anti_buddy_detect_shared_device,
    flagRapidPunches: shop.anti_buddy_flag_rapid_punches,
    requireReviewHighRisk: shop.anti_buddy_require_review_high_risk,
    weakGpsDetectionEnabled: shop.security_weak_gps_alert,
  };
}
