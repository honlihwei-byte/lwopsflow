import { NextResponse } from "next/server";
import { sessionCookieHeader, signAdminSession } from "@/lib/admin-auth";
import {
  companyCanLogin,
  companyFeatureAccess,
  getSubscriptionForCompany,
  resolveEffectiveStatus,
} from "@/lib/billing";
import { COMPANY_STATUS_LABELS, type CompanyRecord } from "@/lib/company";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export async function companyAdminLoginResponse(
  supabase: Supabase,
  company: CompanyRecord,
): Promise<NextResponse> {
  const sub = await getSubscriptionForCompany(supabase, company);

  if (!companyCanLogin(company, sub)) {
    return NextResponse.json(
      { error: "This company account is suspended or inactive." },
      { status: 403 },
    );
  }

  const featureAccess = companyFeatureAccess(company, sub);
  const effectiveStatus = resolveEffectiveStatus(company, sub);
  const displayId = company.login_id?.trim() || company.code;

  const token = signAdminSession({
    role: "company_admin",
    companyId: company.id,
    companyCode: displayId,
    companyName: company.name,
  });

  const redirect = featureAccess === "billing_only" ? "/subscription-required" : "/admin";

  return NextResponse.json(
    {
      ok: true,
      role: "company_admin",
      redirect,
      feature_access: featureAccess,
      company: {
        id: company.id,
        name: company.name,
        code: company.code,
        login_id: company.login_id,
        company_id: displayId,
        status: effectiveStatus,
        status_label: COMPANY_STATUS_LABELS[effectiveStatus],
      },
    },
    { headers: { "Set-Cookie": sessionCookieHeader(token) } },
  );
}
