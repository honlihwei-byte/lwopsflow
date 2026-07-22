import { NextResponse } from "next/server";
import {
  fetchCompanyAntiBuddySettings,
  normalizeSelfiePercent,
} from "@/lib/company-anti-buddy";
import { updateCompanySecurity } from "@/lib/company-security-db";
import { normalizeSelfieProofMode } from "@/lib/selfie-proof-policy";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const settings = await fetchCompanyAntiBuddySettings(supabase, scope.companyId);
    return NextResponse.json({ settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    let skippedDevice = false;

    if (body.selfie_proof_mode !== undefined) {
      patch.selfie_proof_mode = normalizeSelfieProofMode(body.selfie_proof_mode);
      const mode = patch.selfie_proof_mode as string;
      patch.random_selfie_enabled = mode === "random";
    }
    if (body.selfie_proof_random_percent !== undefined) {
      const pct = normalizeSelfiePercent(body.selfie_proof_random_percent);
      patch.selfie_proof_random_percent = pct;
      patch.random_selfie_percent = pct;
    }
    if (body.random_selfie_enabled !== undefined) {
      patch.random_selfie_enabled = body.random_selfie_enabled === true;
      if (body.random_selfie_enabled === true && body.selfie_proof_mode === undefined) {
        patch.selfie_proof_mode = "random";
      }
      if (body.random_selfie_enabled === false && body.selfie_proof_mode === undefined) {
        patch.selfie_proof_mode = "off";
      }
    }
    if (body.random_selfie_percent !== undefined) {
      const pct = normalizeSelfiePercent(body.random_selfie_percent);
      patch.random_selfie_percent = pct;
      patch.selfie_proof_random_percent = pct;
    }
    if (body.device_enforcement_mode !== undefined) {
      const v = String(body.device_enforcement_mode ?? "");
      patch.device_enforcement_mode =
        v === "require_approval" || v === "block_unknown" ? v : "allow_warn";
    }

    if (Object.keys(patch).length === 0) {
      const settings = await fetchCompanyAntiBuddySettings(supabase, scope.companyId);
      return NextResponse.json({ settings, message: "No changes to save." });
    }

    const { error, deviceColumnAvailable } = await updateCompanySecurity(
      supabase,
      scope.companyId,
      patch,
    );

    if (
      body.device_enforcement_mode !== undefined &&
      patch.device_enforcement_mode !== undefined &&
      !deviceColumnAvailable
    ) {
      skippedDevice = true;
    }

    if (error) {
      console.error(error);
      const bodyErr = bodyFromPostgrest(error);
      if (/device_enforcement_mode/i.test(bodyErr.error ?? "")) {
        return NextResponse.json(
          {
            ...bodyErr,
            hint:
              "Run migration supabase/migrations/048_companies_security_columns_repair.sql in Supabase.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(bodyErr, { status: 500 });
    }

    const settings = await fetchCompanyAntiBuddySettings(supabase, scope.companyId);
    let message = "Settings saved successfully.";
    if (skippedDevice) {
      message =
        "Selfie settings saved. Device control was not saved — apply migration 048 in Supabase to enable device_enforcement_mode.";
    }

    return NextResponse.json({ settings, message, warning: skippedDevice ? "migration_required" : undefined });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
