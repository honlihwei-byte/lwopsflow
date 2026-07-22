import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { fetchCompanyOnboardingState } from "@/lib/setup-progress";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const state = await fetchCompanyOnboardingState(supabase, scope.companyId);
    return NextResponse.json(state);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = await req.json();
    const action = String(body.action ?? "");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === "skip") {
      patch.onboarding_wizard_skipped = true;
    } else if (action === "complete") {
      patch.onboarding_wizard_completed_at = new Date().toISOString();
      patch.onboarding_wizard_skipped = false;
    } else {
      return NextResponse.json({ error: "action must be skip or complete" }, { status: 400 });
    }

    const { error } = await supabase.from("companies").update(patch).eq("id", scope.companyId);
    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to update onboarding" }, { status: 500 });
    }

    const state = await fetchCompanyOnboardingState(supabase, scope.companyId);
    return NextResponse.json(state);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
