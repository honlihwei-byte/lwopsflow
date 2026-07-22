import { NextResponse } from "next/server";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById } from "@/lib/company-db";
import { loadStaffScoreDrillDown } from "@/lib/score-drilldown-load";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const opsBlock = blockSuperAdminFromOps(session);
  if (opsBlock) return opsBlock;

  const { staffId } = await params;
  if (!staffId) {
    return NextResponse.json({ error: "Staff ID required." }, { status: 400 });
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

  const url = new URL(req.url);
  const listScoreParam = url.searchParams.get("list_score");
  const listScore =
    listScoreParam != null && listScoreParam !== "" && !Number.isNaN(Number(listScoreParam))
      ? Number(listScoreParam)
      : null;

  const detail = await loadStaffScoreDrillDown(supabase, companyId, staffId, listScore);
  if (!detail) {
    return NextResponse.json({ error: "Staff not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
