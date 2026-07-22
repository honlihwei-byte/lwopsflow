import { NextResponse } from "next/server";
import { isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { fetchCompanyById } from "@/lib/company-db";
import {
  buildStripePaymentLinkUrl,
  stripePaymentLinkForPlan,
  stripePaymentLinksConfigured,
} from "@/lib/stripe-payment-links";
import { planBySlug, type PlanSlug } from "@/lib/subscription-plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;

  if (!stripePaymentLinksConfigured()) {
    return NextResponse.json(
      { error: "Stripe payment links are not configured. Contact support." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const planSlug = String(body.plan_slug ?? "") as PlanSlug;

    const plan = planBySlug(planSlug);
    if (!plan?.amountCents) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const baseLink = stripePaymentLinkForPlan(planSlug);
    if (!baseLink) {
      return NextResponse.json({ error: "Plan payment link not configured" }, { status: 503 });
    }

    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, session.companyId!);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const companyIdDisplay = company.login_id?.trim() || company.code;
    const customerEmail = company.billing_contact_email ?? company.email;

    const paymentUrl = buildStripePaymentLinkUrl(baseLink, {
      clientReferenceId: company.id,
      companyUuid: company.id,
      companyId: companyIdDisplay,
      email: customerEmail,
    });

    return NextResponse.json({
      ok: true,
      payment_url: paymentUrl,
      plan_slug: planSlug,
      plan_name: plan.name,
      amount_label: plan.priceLabel,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
