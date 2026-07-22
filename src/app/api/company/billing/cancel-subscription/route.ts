import { NextResponse } from "next/server";
import { isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { fetchCompanyById } from "@/lib/company-db";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/stripe-billing";
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
    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, session.companyId!);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    await cancelSubscriptionAtPeriodEnd(supabase, company);

    return NextResponse.json({
      ok: true,
      message:
        "Subscription will cancel at the end of the current billing period. You keep access until then.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
