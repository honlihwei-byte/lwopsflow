import {
  attendanceHasPhotoProofRisk,
  calculateRiskScore,
  isWeakGpsAccuracy,
  riskFlagsFromInput,
  riskLevelFromScore,
  type RiskFlag,
} from "@/lib/punch-risk";
import { detectDeviceMismatchForPunch } from "@/lib/device-mismatch";
import {
  detectBuddyPunchOnDevice,
  detectDifferentShopShortTime,
  resolveDeviceTrust,
  type DeviceTrustResult,
} from "@/lib/punch-device-trust-db";
import type { ShopRiskControlFlags } from "@/lib/shop-anti-buddy";
import type { PunchActionType } from "@/lib/attendance";
import type { createAdminClient } from "@/lib/supabase/admin";

const RAPID_PUNCH_WINDOW_MS = 90_000;

type Supabase = ReturnType<typeof createAdminClient>;

export type PunchRiskAssessment = {
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  risk_flags: RiskFlag[];
  device_trust_status: "trusted" | "new_device" | null;
  buddy_punch_flag: boolean;
  review_required: boolean;
  punch_device_id: string | null;
  punch_browser_info: string | null;
};

export type AssessPunchRiskParams = {
  supabase: Supabase;
  staffId: string;
  shopId: string;
  companyId: string | null;
  actionType: PunchActionType;
  deviceId: string | null;
  browserInfo: string | null;
  deviceName?: string | null;
  osName?: string | null;
  gpsAccuracyM: number | null | undefined;
  photoProofUsed: boolean;
  verificationMethod: string | null;
  randomSelfie: boolean;
  existingReviewRequired?: boolean;
  eventDate?: string;
  riskControls?: ShopRiskControlFlags;
  /** Employee portal / QR with authenticated session — verified identity, not anonymous QR pick. */
  verifiedEmployeeIdentity?: boolean;
};

export async function assessPunchRisk(
  params: AssessPunchRiskParams,
): Promise<PunchRiskAssessment & { deviceTrust: DeviceTrustResult }> {
  const verifiedIdentity = params.verifiedEmployeeIdentity === true;
  const deviceTrust = await resolveDeviceTrust(params.supabase, {
    staffId: params.staffId,
    companyId: params.companyId,
    deviceId: params.deviceId,
    browserInfo: params.browserInfo,
    deviceName: params.deviceName,
    osName: params.osName,
    autoTrustVerifiedIdentity: verifiedIdentity,
  });

  const controls = params.riskControls;

  let buddyPunch = false;
  if (controls?.detectSharedDevice !== false && deviceTrust.deviceId && deviceTrust.deviceId !== "unknown") {
    buddyPunch = await detectBuddyPunchOnDevice(params.supabase, {
      companyId: params.companyId,
      deviceId: deviceTrust.deviceId,
      staffId: params.staffId,
    });
  }

  const differentShop = await detectDifferentShopShortTime(params.supabase, {
    staffId: params.staffId,
    shopId: params.shopId,
  });

  let deviceMismatch = false;
  if (controls?.detectDeviceMismatch !== false) {
    deviceMismatch = await detectDeviceMismatchForPunch(params.supabase, {
      staffId: params.staffId,
      shopId: params.shopId,
      actionType: params.actionType,
      deviceId: deviceTrust.deviceId,
      eventDate: params.eventDate,
    });
  }

  let rapidPunch = false;
  if (controls?.flagRapidPunches !== false) {
    const { data: lastRow } = await params.supabase
      .from("attendance")
      .select("created_at")
      .eq("staff_id", params.staffId)
      .eq("shop_id", params.shopId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRow?.created_at) {
      const elapsed = Date.now() - new Date(String(lastRow.created_at)).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < RAPID_PUNCH_WINDOW_MS) {
        rapidPunch = true;
      }
    }
  }

  const weakGps =
    controls?.weakGpsDetectionEnabled === true &&
    isWeakGpsAccuracy(params.gpsAccuracyM);
  const photoProof =
    params.photoProofUsed ||
    attendanceHasPhotoProofRisk(true, params.verificationMethod);

  const newDeviceFlag =
    !verifiedIdentity && controls?.detectNewDevice !== false && deviceTrust.isNewDevice;

  const riskInput = {
    newDevice: newDeviceFlag,
    deviceMismatch,
    buddyPunch,
    weakGps,
    photoProof: photoProof && !params.randomSelfie,
    differentShopShortTime: differentShop,
    randomSelfie: params.randomSelfie,
  };

  const risk_flags = riskFlagsFromInput(riskInput);
  const risk_score = calculateRiskScore(risk_flags);
  const risk_level = riskLevelFromScore(risk_score);

  const review_required =
    params.existingReviewRequired === true ||
    newDeviceFlag ||
    deviceMismatch ||
    buddyPunch ||
    rapidPunch ||
    (controls?.requireReviewHighRisk !== false && risk_level === "high");

  const device_trust_status =
    deviceMismatch || newDeviceFlag ? "new_device" : deviceTrust.deviceTrustStatus;

  return {
    risk_score,
    risk_level,
    risk_flags,
    device_trust_status,
    buddy_punch_flag: buddyPunch,
    review_required,
    punch_device_id: deviceTrust.deviceId,
    punch_browser_info: deviceTrust.browserInfo,
    deviceTrust,
  };
}

export function mergeRiskIntoInsertRow(
  row: Record<string, unknown>,
  assessment: PunchRiskAssessment,
): Record<string, unknown> {
  return {
    ...row,
    risk_score: assessment.risk_score,
    risk_level: assessment.risk_level,
    risk_flags: assessment.risk_flags,
    device_trust_status: assessment.device_trust_status,
    buddy_punch_flag: assessment.buddy_punch_flag,
    review_required: assessment.review_required,
    punch_device_id: assessment.punch_device_id ?? row.punch_device_id ?? null,
    punch_browser_info: assessment.punch_browser_info,
  };
}
