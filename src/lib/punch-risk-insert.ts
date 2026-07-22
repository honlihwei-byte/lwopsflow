import { assessPunchRisk, mergeRiskIntoInsertRow } from "@/lib/punch-risk-assess";
import { verifySelfieChallenge } from "@/lib/punch-selfie-challenge";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchCompanyAntiBuddySettings } from "@/lib/company-anti-buddy";
import {
  fetchShopAntiBuddySettings,
  riskControlsFromShop,
} from "@/lib/shop-anti-buddy";
import { resolveShopSelfieProofPolicy } from "@/lib/shop-selfie-frequency";
import type { PunchActionType } from "@/lib/attendance";

type Supabase = ReturnType<typeof createAdminClient>;

export async function applyAntiBuddyFieldsToInsert(
  supabase: Supabase,
  insertRow: Record<string, unknown>,
  params: {
    staffId: string;
    shopId: string;
    companyId: string | null;
    actionType: PunchActionType;
    deviceId: string | null;
    browserInfo: string | null;
    gpsAccuracyM: number | null | undefined;
    photoProofUsed: boolean;
    verificationMethod: string | null;
    randomSelfiePath: string | null;
    selfieProofPath: string | null;
    selfieCapturedAt: string | null;
    selfieChallengeToken: string | null;
    selfiePendingUpload?: boolean;
    existingReviewRequired?: boolean;
    deviceName?: string | null;
    osName?: string | null;
    eventDate?: string;
    verifiedEmployeeIdentity?: boolean;
  },
): Promise<{ row: Record<string, unknown>; error?: string; status?: number }> {
  const challenge = verifySelfieChallenge(
    params.selfieChallengeToken,
    params.staffId,
    params.shopId,
  );
  const challengeRequired = challenge?.required === true;
  const selfiePending =
    params.selfiePendingUpload === true &&
    Boolean(params.selfieCapturedAt) &&
    challenge != null;
  const randomSelfie =
    challengeRequired && !params.selfieProofPath && !selfiePending;
  const selfieProof = Boolean(params.selfieProofPath);

  if (challengeRequired && !selfieProof && !params.randomSelfiePath && !selfiePending) {
    return {
      row: insertRow,
      error: "Selfie verification is required. Please take a selfie and try again.",
      status: 400,
    };
  }

  if (params.randomSelfiePath) {
    const prefix = `${params.shopId}/${params.staffId}/`;
    if (!params.randomSelfiePath.startsWith(prefix)) {
      return { row: insertRow, error: "Invalid random selfie path.", status: 400 };
    }
  }

  if (params.selfieProofPath && params.companyId) {
    const prefix = `${params.companyId}/`;
    if (!params.selfieProofPath.startsWith(prefix)) {
      return { row: insertRow, error: "Invalid selfie proof path.", status: 400 };
    }
  }

  const shopSettings = await fetchShopAntiBuddySettings(supabase, params.shopId);
  const riskControls = shopSettings ? riskControlsFromShop(shopSettings) : undefined;

  const assessment = await assessPunchRisk({
    supabase,
    staffId: params.staffId,
    shopId: params.shopId,
    companyId: params.companyId,
    actionType: params.actionType,
    deviceId: params.deviceId,
    browserInfo: params.browserInfo,
    deviceName: params.deviceName,
    osName: params.osName,
    gpsAccuracyM: params.gpsAccuracyM,
    photoProofUsed: params.photoProofUsed,
    verificationMethod: params.verificationMethod,
    randomSelfie,
    existingReviewRequired: params.existingReviewRequired,
    eventDate: params.eventDate,
    riskControls,
    verifiedEmployeeIdentity: params.verifiedEmployeeIdentity,
  });

  // Enforce device policy (shop overrides company when set).
  if (
    params.companyId &&
    !params.verifiedEmployeeIdentity &&
    assessment.deviceTrust.deviceTrustStatus === "new_device"
  ) {
    const companySettings = await fetchCompanyAntiBuddySettings(supabase, params.companyId);
    const enforcement =
      shopSettings?.device_enforcement_mode ?? companySettings.device_enforcement_mode;
    if (enforcement === "block_unknown") {
      return {
        row: insertRow,
        error: "New device detected. This company blocks punches from unknown devices.",
        status: 403,
      };
    }
    if (enforcement === "require_approval") {
      return {
        row: insertRow,
        error: "New device detected. Manager approval is required before punching from this device.",
        status: 403,
      };
    }
  }

  let row = mergeRiskIntoInsertRow(insertRow, assessment);

  if (selfieProof && params.selfieProofPath) {
    row = {
      ...row,
      selfie_proof_used: true,
      selfie_proof_path: params.selfieProofPath,
      selfie_captured_at: params.selfieCapturedAt ?? new Date().toISOString(),
      selfie_upload_status: "uploaded",
      verification_method: "selfie_proof",
      audit_notes: [
        typeof row.audit_notes === "string" ? row.audit_notes : "",
        "Selfie proof uploaded at punch.",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500),
    };
  } else if (selfiePending) {
    row = {
      ...row,
      selfie_captured_at: params.selfieCapturedAt ?? new Date().toISOString(),
      selfie_upload_status: "pending",
      audit_notes: [
        typeof row.audit_notes === "string" ? row.audit_notes : "",
        "Selfie captured; upload pending.",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500),
    };
  } else if (randomSelfie && params.randomSelfiePath) {
    row = {
      ...row,
      verification_method: "random_selfie",
      photo_proof_used: true,
      photo_proof_path: params.randomSelfiePath,
      photo_proof_uploaded_at: new Date().toISOString(),
      review_required: true,
      audit_notes: [
        typeof row.audit_notes === "string" ? row.audit_notes : "",
        "Random selfie verification.",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500),
    };
  } else if (shopSettings) {
    const selfiePolicy = resolveShopSelfieProofPolicy(shopSettings);
    if (
      selfiePolicy.mode === "clock_in_only" &&
      params.actionType === "clock_out" &&
      !selfieProof &&
      !selfiePending &&
      !params.randomSelfiePath
    ) {
      row = { ...row, selfie_upload_status: "not_required" };
    }
  }

  return { row };
}
