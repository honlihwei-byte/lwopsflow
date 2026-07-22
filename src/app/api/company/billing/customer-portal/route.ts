import { NextResponse } from "next/server";
import { isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { fetchCompanyById } from "@/lib/company-db";
import { createCustomerPortalSession } from "@/lib/stripe-billing";
import { isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const returnPath =
      typeof body.return_path === "string" && body.return_path.startsWith("/")
        ? body.return_path
        : "/admin/billing";

    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, session.companyId!);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const portalUrl = await createCustomerPortalSession(company, returnPath);

    return NextResponse.json({ ok: true, portal_url: portalUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
