import { NextResponse } from "next/server";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import type { AdminSession } from "@/lib/admin-auth";
import {
  companyFeatureAccess,
  getSubscriptionForCompany,
} from "@/lib/billing";
import { fetchCompanyById, assertShopInCompany, shopIdsForCompany } from "@/lib/company-db";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type CompanyAdminScope = {
  session: AdminSession;
  companyId: string;
  companyShopIds: string[];
};

export async function requireCompanyAdminScope(
  req: Request,
  supabase: Supabase,
): Promise<CompanyAdminScope | NextResponse> {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const block = blockSuperAdminFromOps(session);
  if (block) return block;

  const companyId = session.companyId!;
  const companyShopIds = await shopIdsForCompany(supabase, companyId);
  return { session, companyId, companyShopIds };
}

/** Block attendance/staff/GPS admin APIs when subscription expired (billing pages still allowed). */
export async function requireCompanyFeatureAccess(
  req: Request,
  supabase: Supabase,
): Promise<CompanyAdminScope | NextResponse> {
  const scope = await requireCompanyAdminScope(req, supabase);
  if (scope instanceof NextResponse) return scope;

  const company = await fetchCompanyById(supabase, scope.companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  const sub = await getSubscriptionForCompany(supabase, company);
  const access = companyFeatureAccess(company, sub);
  if (access === "billing_only") {
    return NextResponse.json(
      {
        error: "Subscription required.",
        code: "SUBSCRIPTION_REQUIRED",
        redirect: "/subscription-required",
      },
      { status: 402 },
    );
  }
  if (access === "blocked") {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  return scope;
}

export async function assertShopScope(
  supabase: Supabase,
  shopId: string,
  companyId: string,
): Promise<NextResponse | null> {
  const ok = await assertShopInCompany(supabase, shopId, companyId);
  if (!ok) {
    return NextResponse.json({ error: "Shop not in your company." }, { status: 403 });
  }
  return null;
}
