import { NextResponse } from "next/server";
import {
  addDays,
  getSubscriptionForCompany,
  markPaymentPaidAndActivate,
  resolveEffectiveStatus,
  syncCompanyFromSubscription,
} from "@/lib/billing";
import { COMPANY_STATUS_LABELS, trialEndsAtFromStart, type CompanyStatus } from "@/lib/company";
import { forbiddenAdmin, isNextResponse, requireSuperAdmin } from "@/lib/admin-api-auth";
import { listCompaniesForSuperAdmin } from "@/lib/company-db";
import {
  getCompanyEmailVerificationInfo,
  syncAllPendingEmailVerifications,
} from "@/lib/email-verification-sync";
import { syncStripeSubscriptionFromStripe } from "@/lib/stripe-billing";
import { isStripeConfigured } from "@/lib/stripe";
import { planBySlug, planDisplayName, type PlanSlug } from "@/lib/subscription-plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
};

export async function GET(req: Request) {
  const session = requireSuperAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const supabase = createAdminClient();
    await syncAllPendingEmailVerifications(supabase);
    const rows = await listCompaniesForSuperAdmin(supabase);
    const companies = await Promise.all(
      rows.map(async (c) => {
        const sub = await getSubscriptionForCompany(supabase, c);
        const verification = await getCompanyEmailVerificationInfo(supabase, c);
        const effective = resolveEffectiveStatus(c, sub, {
          emailVerified: verification.email_verified,
        });
        return {
          id: c.id,
          name: c.name,
          company_id: c.company_id_display,
          owner_name: c.owner_name ?? "—",
          phone: c.phone ?? "—",
          email: c.email ?? "—",
          registered_at: c.created_at,
          trial_started_at: c.trial_started_at,
          trial_ends_at: c.trial_ends_at,
          plan_slug: c.plan_slug,
          plan_name: planDisplayName(c.plan_slug),
          subscription_ends_at: c.subscription_ends_at,
          staff_count: c.staff_count,
          shop_count: c.shop_count,
          status: effective,
          status_label: COMPANY_STATUS_LABELS[effective],
          payment_status: c.payment_status,
          payment_status_label: PAYMENT_LABELS[c.payment_status] ?? c.payment_status,
          active: c.active !== false,
          email_verified: verification.email_verified,
          email_verified_label: verification.email_verified ? "Yes" : "No",
          email_verified_at: verification.email_verified_at,
        };
      }),
    );
    return NextResponse.json({ companies });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = requireSuperAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === "sync_stripe_subscription") {
      if (!isStripeConfigured()) {
        return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
      }
      const email = body.email ? String(body.email).trim() : undefined;
      const stripeCustomerId = body.stripe_customer_id
        ? String(body.stripe_customer_id).trim()
        : undefined;
      const stripeSubscriptionId = body.stripe_subscription_id
        ? String(body.stripe_subscription_id).trim()
        : undefined;
      if (!email && !stripeCustomerId && !stripeSubscriptionId) {
        return NextResponse.json(
          { error: "Provide email, stripe_customer_id, or stripe_subscription_id." },
          { status: 400 },
        );
      }
      const result = await syncStripeSubscriptionFromStripe(supabase, {
        email,
        stripeCustomerId,
        stripeSubscriptionId,
      });
      return NextResponse.json({
        ok: true,
        company_id: result.company.id,
        company_name: result.company.name,
        stripe_subscription_id: result.subscriptionId,
      });
    }

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: company, error: loadErr } = await supabase
      .from("companies")
      .select("id, status, trial_started_at, trial_ends_at, subscription_ends_at")
      .eq("id", id)
      .maybeSingle();

    if (loadErr || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const now = new Date();

    switch (action) {
      case "activate": {
        const end = new Date(now);
        end.setDate(end.getDate() + 30);
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("plan_slug")
          .eq("company_id", id)
          .maybeSingle();
        const planSlug = String(subData?.plan_slug ?? "starter");
        const plan = planBySlug(planSlug);
        await syncCompanyFromSubscription(supabase, id, {
          status: "active",
          payment_status: "paid",
          subscription_ends_at: end.toISOString(),
          trial_started_at: String(company.trial_started_at),
          trial_ends_at: company.trial_ends_at ? String(company.trial_ends_at) : null,
          plan_slug: planSlug,
          max_staff: plan?.maxStaff ?? null,
          max_shops: plan?.maxShops ?? null,
        });
        await supabase.from("companies").update({ active: true }).eq("id", id);
        break;
      }
      case "suspend": {
        await syncCompanyFromSubscription(supabase, id, {
          status: "suspended",
          payment_status: "overdue",
          trial_started_at: String(company.trial_started_at),
          trial_ends_at: company.trial_ends_at ? String(company.trial_ends_at) : null,
          subscription_ends_at: company.subscription_ends_at
            ? String(company.subscription_ends_at)
            : null,
        });
        await supabase.from("companies").update({ active: false }).eq("id", id);
        break;
      }
      case "unsuspend": {
        await supabase.from("companies").update({ active: true }).eq("id", id);
        await syncCompanyFromSubscription(supabase, id, {
          status: "active",
          payment_status: "paid",
          trial_started_at: String(company.trial_started_at),
          trial_ends_at: company.trial_ends_at ? String(company.trial_ends_at) : null,
          subscription_ends_at: company.subscription_ends_at
            ? String(company.subscription_ends_at)
            : addDays(null, 30),
        });
        break;
      }
      case "extend_trial": {
        const days = Number(body.days ?? 14);
        const trialEnd = addDays(
          company.trial_ends_at ? String(company.trial_ends_at) : now.toISOString(),
          days,
        );
        await syncCompanyFromSubscription(supabase, id, {
          status: "trial",
          plan_slug: "trial",
          payment_status: "pending",
          trial_started_at: String(company.trial_started_at ?? now.toISOString()),
          trial_ends_at: trialEnd,
          subscription_ends_at: null,
        });
        break;
      }
      case "extend_subscription": {
        const days = Number(body.days ?? 30);
        const base =
          company.subscription_ends_at && new Date(String(company.subscription_ends_at)) > now
            ? String(company.subscription_ends_at)
            : now.toISOString();
        const subEnd = addDays(base, days);
        await syncCompanyFromSubscription(supabase, id, {
          status: "active",
          payment_status: "paid",
          trial_started_at: String(company.trial_started_at),
          trial_ends_at: company.trial_ends_at ? String(company.trial_ends_at) : null,
          subscription_ends_at: subEnd,
        });
        break;
      }
      case "mark_paid": {
        const paymentId = body.payment_id ? String(body.payment_id) : undefined;
        await markPaymentPaidAndActivate(supabase, id, paymentId);
        break;
      }
      case "mark_pending": {
        await supabase
          .from("subscriptions")
          .upsert(
            { company_id: id, payment_status: "pending", updated_at: now.toISOString() },
            { onConflict: "company_id" },
          );
        break;
      }
      case "mark_overdue": {
        await supabase
          .from("subscriptions")
          .upsert(
            { company_id: id, payment_status: "overdue", updated_at: now.toISOString() },
            { onConflict: "company_id" },
          );
        break;
      }
      case "change_plan": {
        const planSlug = String(body.plan_slug ?? "starter") as PlanSlug;
        const plan = planBySlug(planSlug);
        if (!plan && planSlug !== "trial") {
          return forbiddenAdmin("Invalid plan");
        }
        await supabase
          .from("subscriptions")
          .upsert(
            {
              company_id: id,
              plan_slug: planSlug,
              max_staff: plan?.maxStaff ?? null,
              max_shops: plan?.maxShops ?? null,
              updated_at: now.toISOString(),
            },
            { onConflict: "company_id" },
          );
        break;
      }
      case "set_status": {
        const status = body.status as CompanyStatus;
        const allowed: CompanyStatus[] = ["trial", "active", "suspended", "expired"];
        if (!allowed.includes(status)) {
          return forbiddenAdmin("Invalid status");
        }
        await syncCompanyFromSubscription(supabase, id, {
          status,
          payment_status:
            status === "active" ? "paid" : status === "suspended" ? "overdue" : "pending",
          trial_started_at: String(company.trial_started_at ?? now.toISOString()),
          trial_ends_at: company.trial_ends_at ? String(company.trial_ends_at) : null,
          subscription_ends_at: company.subscription_ends_at
            ? String(company.subscription_ends_at)
            : null,
        });
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = requireSuperAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();

    if (!name || !code) {
      return NextResponse.json({ error: "name and code are required" }, { status: 400 });
    }

    const trialStart = new Date();
    const trialEnd = trialEndsAtFromStart(trialStart);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name,
        code,
        status: "trial",
        trial_started_at: trialStart.toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        admin_pin: "000000",
        active: true,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    await syncCompanyFromSubscription(supabase, String(data.id), {
      status: "trial",
      plan_slug: "trial",
      payment_status: "pending",
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      subscription_ends_at: null,
    });

    return NextResponse.json({ company: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
