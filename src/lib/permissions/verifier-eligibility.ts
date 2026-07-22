import { canAccessShop, canVerifyTasks, type StaffPermissionProfile } from "@/lib/permissions/resolve";

/** Verifier eligibility: shop access + explicit verify/approve permission only. */
export function isEligibleTaskVerifier(
  profile: StaffPermissionProfile,
  shopId: string,
): boolean {
  if (!canAccessShop(profile, shopId)) return false;
  return canVerifyTasks(profile);
}
