import { NextResponse } from "next/server";
import { isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { fetchCompanyById } from "@/lib/company-db";
import { syncCompanyBillingFromStripe } from "@/lib/stripe-billing";
import { isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId =
      typeof body.session_id === "string" ? body.session_id.trim() : "";

    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, session.companyId!);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const synced = await syncCompanyBillingFromStripe(supabase, company, {
      sessionId: sessionId || null,
    });

    if (!synced) {
      return NextResponse.json(
        {
          ok: false,
          synced: false,
          error: "No completed Stripe checkout session found for this company yet.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      synced: true,
      company_id: synced.id,
      message: "Subscription synced from Stripe.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
