import type { ClockGpsVerifySnapshot } from "@/lib/clock-verified-gps";
import {
  getIndoorVerifyFailureCount,
  PHOTO_PROOF_MIN_FAILURES,
} from "@/lib/photo-proof-failure-counter";
import {
  shopVerificationIncludesLocationProof,
  type AttendanceVerificationMode,
} from "@/lib/shop-anti-buddy";

export type PhotoProofShopFlags = {
  gpsIndoorMode?: boolean;
  allowPhotoProofFallback?: boolean;
  attendanceVerificationMode?: AttendanceVerificationMode | null;
};

export function isPhotoProofEnabledForShop(shop: PhotoProofShopFlags | null | undefined): boolean {
  if (!shop?.gpsIndoorMode) return false;
  if (shop.attendanceVerificationMode) {
    return shopVerificationIncludesLocationProof(shop.attendanceVerificationMode);
  }
  return shop.allowPhotoProofFallback === true;
}

export function canShowPhotoProofOption(
  shop: PhotoProofShopFlags | null | undefined,
  shopId: string,
  staffId: string,
  snap: ClockGpsVerifySnapshot,
  gpsVerifiedForPunch: boolean,
): boolean {
  if (!isPhotoProofEnabledForShop(shop)) return false;
  if (!shopId || !staffId.trim()) return false;
  if (gpsVerifiedForPunch) return false;
  if (snap.isCheckingLocation || snap.phase === "checking") return false;
  if (getIndoorVerifyFailureCount(shopId, staffId) < PHOTO_PROOF_MIN_FAILURES) return false;
  return true;
}
