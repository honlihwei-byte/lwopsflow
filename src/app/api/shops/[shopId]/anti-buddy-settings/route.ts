import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  DEFAULT_SHOP_ANTI_BUDDY,
  fetchShopAntiBuddySettings,
  normalizeAttendanceVerificationMode,
  photoProofFallbackForVerificationMode,
  shopAntiBuddyFromRow,
  shopVerificationIncludesSelfie,
  SHOP_ANTI_BUDDY_SELECT,
} from "@/lib/shop-anti-buddy";
import { applySecurityToggles, securityTogglesFromShop } from "@/lib/shop-security-settings";
import { normalizeShopSelfieFrequency } from "@/lib/shop-selfie-frequency";
import { normalizeSelfiePercent, normalizeSelfieProofMode } from "@/lib/selfie-proof-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError, missingColumnName } from "@/lib/company-security-db";
import { SHOP_ANTI_BUDDY_SELECT_BASE } from "@/lib/shop-anti-buddy";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const settings = await fetchShopAntiBuddySettings(supabase, shopId);
    if (!settings) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    return NextResponse.json({ settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const body = await req.json();
    const current = (await fetchShopAntiBuddySettings(supabase, shopId)) ?? DEFAULT_SHOP_ANTI_BUDDY;

    const attendance_verification_mode = normalizeAttendanceVerificationMode(
      body.attendance_verification_mode ?? current.attendance_verification_mode,
    );

    const patch: Record<string, unknown> = {
      attendance_verification_mode,
      allow_photo_proof_fallback: photoProofFallbackForVerificationMode(attendance_verification_mode),
      anti_buddy_detect_new_device:
        body.anti_buddy_detect_new_device !== undefined
          ? body.anti_buddy_detect_new_device === true
          : current.anti_buddy_detect_new_device,
      anti_buddy_detect_device_mismatch:
        body.anti_buddy_detect_device_mismatch !== undefined
          ? body.anti_buddy_detect_device_mismatch === true
          : current.anti_buddy_detect_device_mismatch,
      anti_buddy_detect_shared_device:
        body.anti_buddy_detect_shared_device !== undefined
          ? body.anti_buddy_detect_shared_device === true
          : current.anti_buddy_detect_shared_device,
      anti_buddy_flag_rapid_punches:
        body.anti_buddy_flag_rapid_punches !== undefined
          ? body.anti_buddy_flag_rapid_punches === true
          : current.anti_buddy_flag_rapid_punches,
      anti_buddy_require_review_high_risk:
        body.anti_buddy_require_review_high_risk !== undefined
          ? body.anti_buddy_require_review_high_risk === true
          : current.anti_buddy_require_review_high_risk,
      updated_at: new Date().toISOString(),
    };

    if (body.selfie_proof_mode !== undefined) {
      const raw = body.selfie_proof_mode;
      patch.selfie_proof_mode =
        raw === "" || raw === "inherit" || raw == null
          ? null
          : normalizeSelfieProofMode(raw);
    }
    if (body.selfie_proof_random_percent !== undefined) {
      const raw = body.selfie_proof_random_percent;
      patch.selfie_proof_random_percent =
        raw === "" || raw == null ? null : normalizeSelfiePercent(raw);
    }
    if (body.device_enforcement_mode !== undefined) {
      const v = String(body.device_enforcement_mode ?? "");
      patch.device_enforcement_mode =
        v === "" || v === "inherit"
          ? null
          : v === "require_approval" || v === "block_unknown"
            ? v
            : "allow_warn";
    }
    if (body.security_weak_gps_alert !== undefined) {
      patch.security_weak_gps_alert = body.security_weak_gps_alert === true;
    }

    if (
      body.enable_selfie_verification !== undefined ||
      body.enable_new_device_review !== undefined ||
      body.enable_weak_gps_detection !== undefined ||
      body.enable_buddy_punch_detection !== undefined ||
      body.selfie_frequency !== undefined
    ) {
      const currentToggles = securityTogglesFromShop(
        current,
        current.security_weak_gps_alert,
      );
      const toggles = {
        enable_selfie_verification:
          body.enable_selfie_verification ?? currentToggles.enable_selfie_verification,
        selfie_frequency:
          body.selfie_frequency != null
            ? normalizeShopSelfieFrequency(body.selfie_frequency)
            : currentToggles.selfie_frequency,
        enable_new_device_review:
          body.enable_new_device_review ?? currentToggles.enable_new_device_review,
        enable_weak_gps_detection:
          body.enable_weak_gps_detection ?? currentToggles.enable_weak_gps_detection,
        enable_buddy_punch_detection:
          body.enable_buddy_punch_detection ?? currentToggles.enable_buddy_punch_detection,
      };
      if (
        body.enable_selfie_verification === true &&
        toggles.selfie_frequency === "disabled"
      ) {
        toggles.selfie_frequency = "clock_in_only";
      }
      const applied = applySecurityToggles(current, toggles);
      patch.attendance_verification_mode = applied.attendance_verification_mode;
      patch.allow_photo_proof_fallback = photoProofFallbackForVerificationMode(
        applied.attendance_verification_mode,
      );
      patch.anti_buddy_detect_new_device = applied.anti_buddy_detect_new_device;
      patch.anti_buddy_detect_device_mismatch = applied.anti_buddy_detect_device_mismatch;
      patch.anti_buddy_detect_shared_device = applied.anti_buddy_detect_shared_device;
      patch.anti_buddy_flag_rapid_punches = applied.anti_buddy_flag_rapid_punches;
      patch.security_weak_gps_alert = toggles.enable_weak_gps_detection;
      patch.selfie_proof_mode = applied.selfie_proof_mode;
      patch.selfie_proof_random_percent = applied.selfie_proof_random_percent;
    }

    let res = await supabase
      .from("shops")
      .update(patch)
      .eq("id", shopId)
      .eq("company_id", scope.companyId)
      .select(SHOP_ANTI_BUDDY_SELECT)
      .maybeSingle();

    if (
      res.error &&
      isMissingColumnError(res.error) &&
      (missingColumnName(res.error) === "security_weak_gps_alert" ||
        missingColumnName(res.error) === "device_enforcement_mode")
    ) {
      const col = missingColumnName(res.error)!;
      const patchReduced = { ...patch };
      delete patchReduced[col];
      res = await supabase
        .from("shops")
        .update(patchReduced)
        .eq("id", shopId)
        .eq("company_id", scope.companyId)
        .select(SHOP_ANTI_BUDDY_SELECT_BASE)
        .maybeSingle();
    }

    const { data, error } = res;

    if (error) {
      console.error(error);
      const bodyErr = bodyFromPostgrest(error);
      if (/security_weak_gps_alert|device_enforcement_mode/i.test(bodyErr.error ?? "")) {
        bodyErr.hint =
          "Run supabase/migrations/048_companies_security_columns_repair.sql in Supabase.";
      }
      return NextResponse.json(bodyErr, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    return NextResponse.json({ settings: shopAntiBuddyFromRow(data as Record<string, unknown>) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
