import type { ShopAntiBuddySettings } from "@/lib/shop-anti-buddy";
import {
  normalizeAttendanceVerificationMode,
  shopVerificationIncludesSelfie,
} from "@/lib/shop-anti-buddy";
import {
  applySelfieFrequencyToShopFields,
  normalizeShopSelfieFrequency,
  selfieFrequencyFromShop,
  type ShopSelfieFrequency,
} from "@/lib/shop-selfie-frequency";

export type ShopSecurityToggles = {
  enable_selfie_verification: boolean;
  selfie_frequency: ShopSelfieFrequency;
  enable_new_device_review: boolean;
  enable_weak_gps_detection: boolean;
  enable_buddy_punch_detection: boolean;
};

export type ShopSecurityRow = ShopAntiBuddySettings & {
  security_weak_gps_alert: boolean;
};

export function securityTogglesFromShop(
  shop: ShopAntiBuddySettings,
  weakGpsAlert: boolean,
): ShopSecurityToggles {
  const enableSelfie = shopVerificationIncludesSelfie(shop.attendance_verification_mode);
  return {
    enable_selfie_verification: enableSelfie,
    selfie_frequency: enableSelfie ? selfieFrequencyFromShop(shop) : "disabled",
    enable_new_device_review: shop.anti_buddy_detect_new_device,
    enable_weak_gps_detection: weakGpsAlert,
    enable_buddy_punch_detection:
      shop.anti_buddy_detect_shared_device &&
      shop.anti_buddy_detect_device_mismatch &&
      shop.anti_buddy_flag_rapid_punches,
  };
}

/** Apply simplified security toggles onto shop anti-buddy fields. */
export function applySecurityToggles(
  current: ShopAntiBuddySettings,
  toggles: ShopSecurityToggles,
): ShopAntiBuddySettings {
  let mode = current.attendance_verification_mode;
  if (toggles.enable_selfie_verification) {
    if (mode === "gps_only") mode = "gps_selfie";
    else if (mode === "gps_location_proof") mode = "gps_selfie_location_proof";
  } else {
    if (mode === "gps_selfie") mode = "gps_only";
    else if (mode === "gps_selfie_location_proof") mode = "gps_location_proof";
  }

  const buddy = toggles.enable_buddy_punch_detection;

  const frequency = toggles.enable_selfie_verification
    ? normalizeShopSelfieFrequency(toggles.selfie_frequency)
    : "disabled";

  const selfieFields = toggles.enable_selfie_verification
    ? applySelfieFrequencyToShopFields(frequency)
    : applySelfieFrequencyToShopFields("disabled");

  return {
    ...current,
    attendance_verification_mode: normalizeAttendanceVerificationMode(mode),
    anti_buddy_detect_new_device: toggles.enable_new_device_review,
    anti_buddy_detect_device_mismatch: buddy,
    anti_buddy_detect_shared_device: buddy,
    anti_buddy_flag_rapid_punches: buddy,
    selfie_proof_mode: selfieFields.selfie_proof_mode,
    selfie_proof_random_percent: selfieFields.selfie_proof_random_percent,
  };
}
