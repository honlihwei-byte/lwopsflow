import { NextResponse } from "next/server";
import {
  loadShopForPunch,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { issueSelfieChallenge } from "@/lib/punch-selfie-challenge";
import { punchSecurityDebugEnabled, punchSecurityDebugLog } from "@/lib/punch-security-debug";
import { evaluateSelfieProofRequired } from "@/lib/selfie-proof-policy";
import { fetchShopAntiBuddySettings, shopVerificationIncludesSelfie } from "@/lib/shop-anti-buddy";
import {
  resolveShopSelfieProofPolicy,
  selfieFrequencyFromShop,
} from "@/lib/shop-selfie-frequency";
import { securityTogglesFromShop } from "@/lib/shop-security-settings";
import { createAdminClient } from "@/lib/supabase/admin";

/** Pre-punch check: selfie proof requirement (front camera). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim();
    const staffId = url.searchParams.get("staff_id")?.trim();
    const staffIdentifier = url.searchParams.get("staff_identifier")?.trim();
    const actionTypeRaw = url.searchParams.get("action_type")?.trim();
    const actionType =
      actionTypeRaw === "clock_out" ? "clock_out" : actionTypeRaw === "clock_in" ? "clock_in" : undefined;
    const deviceId = url.searchParams.get("punch_device_id")?.trim() || null;
    const punchQrToken =
      normalizePunchQrToken(url.searchParams.get("punch_qr_token")) ??
      normalizePunchQrToken(url.searchParams.get("t"));

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const employeeSession = employeeSessionFromRequest(req);
    const shopResult = await loadShopForPunch(supabase, shopId);
    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }

    const { shop } = shopResult;
    if (!staffId && !staffIdentifier) {
      if (!employeeSession) {
        return NextResponse.json({
          selfie_proof_mode: "off",
          require_selfie_proof: false,
          require_random_selfie: false,
        });
      }
    }

    const staffResult = await validateStaffForPunch(supabase, shopId, {
      staffId: staffId || employeeSession?.staffId || undefined,
      staffIdentifier: staffIdentifier || undefined,
      employeePortalShopAccess: Boolean(employeeSession),
    });
    if ("error" in staffResult) {
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }

    const accessCheck = validatePunchAccess({
      shopId,
      storedToken: shop.punchQrToken,
      providedQr: punchQrToken,
      employeeSession,
      staffId: staffResult.staff.id,
      staffAssignedToShop: true,
    });
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const shopSettings = await fetchShopAntiBuddySettings(supabase, shopId);
    const securityToggles = shopSettings
      ? securityTogglesFromShop(shopSettings, shopSettings.security_weak_gps_alert)
      : null;
    const selfiePolicy = shopSettings ? resolveShopSelfieProofPolicy(shopSettings) : null;

    const evaluation = await evaluateSelfieProofRequired(supabase, {
      companyId: shop.companyId,
      staffId: staffResult.staff.id,
      shopId,
      deviceId,
      actionType,
      checkPunchRisk: true,
    });

    punchSecurityDebugLog("punch-precheck", {
      shop_id: shopId,
      staff_id: staffResult.staff.id,
      device_id: deviceId,
      loaded_shop_security: securityToggles,
      selfie_verification_enabled: shopSettings
        ? shopVerificationIncludesSelfie(shopSettings.attendance_verification_mode)
        : false,
      selfie_frequency: shopSettings ? selfieFrequencyFromShop(shopSettings) : null,
      effective_selfie_mode: selfiePolicy?.mode,
      effective_random_percent: selfiePolicy?.randomPercent,
      require_selfie_proof: evaluation.required,
      selfie_reason: evaluation.reason,
    });

    const challenge = issueSelfieChallenge({
      staffId: staffResult.staff.id,
      shopId,
      required: evaluation.required,
    });

    const payload: Record<string, unknown> = {
      selfie_proof_mode: evaluation.mode,
      require_selfie_proof: evaluation.required,
      selfie_proof_reason: evaluation.reason,
      require_random_selfie: evaluation.required,
      selfie_challenge_token: challenge.token,
      selfie_challenge_expires_at: challenge.expiresAt,
      selfie_frequency: selfiePolicy?.frequency ?? "disabled",
    };

    if (punchSecurityDebugEnabled()) {
      payload.debug = {
        security_toggles: securityToggles,
        selfie_required: evaluation.required,
        selfie_frequency: selfiePolicy?.frequency,
        random_selfie_roll_skipped: evaluation.mode !== "random",
        device_id: deviceId,
      };
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
