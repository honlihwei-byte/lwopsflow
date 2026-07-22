import { NextResponse } from "next/server";
import { adminSessionFromRequest } from "@/lib/admin-auth";
import {
  companyFeatureAccess,
  getSubscriptionForCompany,
  resolveEffectiveStatus,
  staffCountForCompany,
  shopCountForCompany,
} from "@/lib/billing";
import { COMPANY_STATUS_LABELS } from "@/lib/company";
import { planDisplayName } from "@/lib/subscription-plans";
import { fetchCompanyById } from "@/lib/company-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = adminSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  if (session.role === "super_admin") {
    return NextResponse.json({
      authenticated: true,
      role: "super_admin",
      role_label: "Super Admin",
      feature_access: "full",
    });
  }

  const supabase = createAdminClient();
  const company = session.companyId
    ? await fetchCompanyById(supabase, session.companyId)
    : null;

  if (!company) {
    return NextResponse.json({
      authenticated: true,
      role: "company_admin",
      role_label: "Company Admin",
      feature_access: "full",
      company: {
        id: session.companyId,
        name: session.companyName,
        code: session.companyCode,
      },
    });
  }

  const sub = await getSubscriptionForCompany(supabase, company);
  const effectiveStatus = resolveEffectiveStatus(company, sub);
  const featureAccess = companyFeatureAccess(company, sub);
  const [staffCount, shopCount] = await Promise.all([
    staffCountForCompany(supabase, company.id),
    shopCountForCompany(supabase, company.id),
  ]);

  return NextResponse.json({
    authenticated: true,
    role: "company_admin",
    role_label: "Company Admin",
    feature_access: featureAccess,
    company: {
      id: company.id,
      name: company.name,
      code: company.code,
      login_id: company.login_id,
      company_id: company.login_id?.trim() || company.code,
      status: effectiveStatus,
      status_label: COMPANY_STATUS_LABELS[effectiveStatus],
      plan_slug: sub.plan_slug,
      plan_name: planDisplayName(sub.plan_slug),
      payment_status: sub.payment_status,
      trial_started_at: sub.trial_started_at,
      trial_ends_at: sub.trial_ends_at,
      subscription_ends_at: sub.subscription_ends_at,
      staff_count: staffCount,
      shop_count: shopCount,
    },
  });
}
