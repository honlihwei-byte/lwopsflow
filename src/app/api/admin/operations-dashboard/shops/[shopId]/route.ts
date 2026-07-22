import { NextResponse } from "next/server";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById } from "@/lib/company-db";
import { loadShopScoreDrillDown } from "@/lib/score-drilldown-load";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const opsBlock = blockSuperAdminFromOps(session);
  if (opsBlock) return opsBlock;

  const { shopId } = await params;
  if (!shopId) {
    return NextResponse.json({ error: "Shop ID required." }, { status: 400 });
  }

  const companyId = session.companyId!;
  const supabase = createAdminClient();

  const company = await fetchCompanyById(supabase, companyId);
  if (company) {
    const sub = await getSubscriptionForCompany(supabase, company);
    if (companyFeatureAccess(company, sub) !== "full") {
      return NextResponse.json(
        { error: "Subscription required.", code: "SUBSCRIPTION_REQUIRED" },
        { status: 402 },
      );
    }
  }

  const detail = await loadShopScoreDrillDown(supabase, companyId, shopId);
  if (!detail) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
