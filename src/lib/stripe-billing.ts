import type Stripe from "stripe";
import {
  fetchSubscription,
  nextInvoiceNumber,
  syncCompanyFromSubscription,
  type SubscriptionRow,
} from "@/lib/billing";
import type { CompanyRecord, CompanyStatus } from "@/lib/company";
import { fetchCompanyByEmail, fetchCompanyById } from "@/lib/company-db";
import {
  planSlugFromStripePrice,
  planSlugFromStripePriceId,
} from "@/lib/stripe-prices";
import {
  FREE_PLAN,
  planBySlug,
  type PaymentStatus,
  type PlanSlug,
} from "@/lib/subscription-plans";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

type Supabase = ReturnType<typeof createAdminClient>;

function resolvePlanSlug(
  subscription: Stripe.Subscription,
  fallback?: string | null,
): PlanSlug {
  const metaSlug = subscription.metadata?.plan_slug?.trim();
  if (metaSlug) {
    const slug = metaSlug.toLowerCase();
    if (slug === "starter" || slug === "growth" || slug === "business") return slug;
  }
  const item = subscription.items.data[0];
  const fromPrice = planSlugFromStripePrice(item?.price);
  if (fromPrice) return fromPrice;
  if (item?.price?.id) {
    const fromId = planSlugFromStripePriceId(item.price.id);
    if (fromId) return fromId;
  }
  if (fallback) {
    const slug = fallback.toLowerCase();
    if (slug === "starter" || slug === "growth" || slug === "business") return slug;
  }
  return "starter";
}

function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): {
  status: CompanyStatus;
  payment_status: PaymentStatus;
  active: boolean;
} {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return { status: "active", payment_status: "paid", active: true };
    case "past_due":
    case "unpaid":
      return { status: "suspended", payment_status: "overdue", active: false };
    case "canceled":
    case "incomplete_expired":
      return { status: "expired", payment_status: "overdue", active: false };
    case "paused":
      return { status: "suspended", payment_status: "overdue", active: false };
    default:
      return { status: "suspended", payment_status: "pending", active: false };
  }
}

export async function fetchCompanyByStripeCustomerId(
  supabase: Supabase,
  customerId: string,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, code, login_id, status, trial_started_at, trial_ends_at, subscription_ends_at, admin_pin, owner_name, phone, email, active, password_hash, auth_user_id, email_verified_at, timezone, billing_contact_email, billing_contact_phone, stripe_customer_id, stripe_subscription_id, created_at, updated_at",
    )
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error || !data) return null;
  const { companyRowFromDb } = await import("@/lib/company");
  return companyRowFromDb(data as Record<string, unknown>);
}

export async function fetchCompanyByStripeSubscriptionId(
  supabase: Supabase,
  subscriptionId: string,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, code, login_id, status, trial_started_at, trial_ends_at, subscription_ends_at, admin_pin, owner_name, phone, email, active, password_hash, auth_user_id, email_verified_at, timezone, billing_contact_email, billing_contact_phone, stripe_customer_id, stripe_subscription_id, created_at, updated_at",
    )
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error || !data) return null;
  const { companyRowFromDb } = await import("@/lib/company");
  return companyRowFromDb(data as Record<string, unknown>);
}

export async function resolveCustomerEmail(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<string | null> {
  if (!customer) return null;
  if (typeof customer === "object" && "email" in customer && customer.email) {
    return customer.email;
  }
  if (typeof customer !== "string") return null;
  try {
    const stripe = getStripe();
    const retrieved = await stripe.customers.retrieve(customer);
    if (retrieved.deleted) return null;
    return retrieved.email ?? null;
  } catch {
    return null;
  }
}

/** Resolve company from Stripe subscription — email is primary match. */
export async function resolveCompanyForStripeSubscription(
  supabase: Supabase,
  subscription: Stripe.Subscription,
  hints?: {
    companyId?: string | null;
    customerId?: string | null;
    customerEmail?: string | null;
  },
): Promise<CompanyRecord | null> {
  const email =
    hints?.customerEmail?.trim() ||
    (await resolveCustomerEmail(subscription.customer)) ||
    null;

  if (email) {
    const byEmail = await fetchCompanyByEmail(supabase, email);
    if (byEmail) return byEmail;
  }

  const companyId =
    hints?.companyId?.trim() || subscription.metadata?.company_id?.trim() || null;

  if (companyId) {
    const company = await fetchCompanyById(supabase, companyId);
    if (company) return company;
  }

  const customerId =
    hints?.customerId?.trim() ||
    (typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id) ||
    null;

  if (customerId) {
    const byCustomer = await fetchCompanyByStripeCustomerId(supabase, customerId);
    if (byCustomer) return byCustomer;
  }

  return fetchCompanyByStripeSubscriptionId(supabase, subscription.id);
}

/** Resolve company from checkout session — client_reference_id is primary match. */
export async function resolveCompanyForCheckoutSession(
  supabase: Supabase,
  session: Stripe.Checkout.Session,
): Promise<CompanyRecord | null> {
  const clientReferenceId = session.client_reference_id?.trim();
  if (clientReferenceId) {
    const byReference = await fetchCompanyById(supabase, clientReferenceId);
    if (byReference) return byReference;
  }

  const metadataCompanyId =
    session.metadata?.company_uuid?.trim() || session.metadata?.company_id?.trim() || null;
  if (metadataCompanyId) {
    const byMetadata = await fetchCompanyById(supabase, metadataCompanyId);
    if (byMetadata) return byMetadata;
  }

  const email =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    (await resolveCustomerEmail(session.customer)) ||
    null;

  if (email) {
    const byEmail = await fetchCompanyByEmail(supabase, email);
    if (byEmail) return byEmail;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (customerId) {
    return fetchCompanyByStripeCustomerId(supabase, customerId);
  }

  return null;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  const itemEnd = subscription.items.data[0]?.current_period_end;
  if (itemEnd) return itemEnd;
  const legacy = (subscription as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  if (legacy) return legacy;
  return Math.floor(Date.now() / 1000) + 30 * 86400;
}

/** Downgrade to Free Plan when subscription is cancelled. */
export async function applyFreePlanDowngrade(
  supabase: Supabase,
  companyId: string,
  stripeCustomerId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const company = await fetchCompanyById(supabase, companyId);

  await syncCompanyFromSubscription(supabase, companyId, {
    status: "expired",
    plan_slug: FREE_PLAN.slug,
    payment_status: "overdue",
    subscription_ends_at: now,
    max_staff: FREE_PLAN.maxStaff,
    max_shops: FREE_PLAN.maxShops,
  });

  await supabase
    .from("companies")
    .update({
      active: false,
      stripe_subscription_id: null,
      stripe_customer_id: stripeCustomerId ?? company?.stripe_customer_id ?? null,
      updated_at: now,
    })
    .eq("id", companyId);

  await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_subscription_status: "canceled",
      cancel_at_period_end: false,
      stripe_customer_id: stripeCustomerId ?? company?.stripe_customer_id ?? null,
      current_period_end: now,
      next_billing_at: null,
      user_id: company?.auth_user_id ?? null,
      updated_at: now,
    })
    .eq("company_id", companyId);
}

/** Sync company + subscription rows from a Stripe subscription object. */
export async function applyStripeSubscription(
  supabase: Supabase,
  companyId: string,
  subscription: Stripe.Subscription,
  options?: { fallbackPlanSlug?: string | null },
): Promise<void> {
  if (subscription.status === "canceled") {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null;
    await applyFreePlanDowngrade(supabase, companyId, customerId);
    return;
  }

  const planSlug = resolvePlanSlug(subscription, options?.fallbackPlanSlug);
  const plan = planBySlug(planSlug);
  const periodEnd = new Date(subscriptionPeriodEnd(subscription) * 1000).toISOString();
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const mapped = mapStripeSubscriptionStatus(subscription.status);
  const company = await fetchCompanyById(supabase, companyId);
  const existingSub = await fetchSubscription(supabase, companyId);
  const trialStartedAt =
    existingSub?.trial_started_at ?? company?.trial_started_at ?? new Date().toISOString();

  await syncCompanyFromSubscription(supabase, companyId, {
    status: mapped.status,
    plan_slug: planSlug,
    payment_status: mapped.payment_status,
    subscription_ends_at: periodEnd,
    trial_started_at: trialStartedAt,
    trial_ends_at: company?.trial_ends_at ?? existingSub?.trial_ends_at ?? null,
    max_staff: plan?.maxStaff ?? null,
    max_shops: plan?.maxShops ?? null,
  });

  const { error: companyErr } = await supabase
    .from("companies")
    .update({
      active: mapped.active,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);
  if (companyErr) {
    throw new Error(`Failed to store Stripe IDs on company: ${companyErr.message}`);
  }

  const { error: subErr } = await supabase.from("subscriptions").upsert(
    {
      company_id: companyId,
      user_id: company?.auth_user_id ?? null,
      status: mapped.status,
      plan_slug: planSlug,
      payment_status: mapped.payment_status,
      trial_started_at: trialStartedAt,
      trial_ends_at: company?.trial_ends_at ?? existingSub?.trial_ends_at ?? null,
      subscription_ends_at: periodEnd,
      current_period_end: periodEnd,
      next_billing_at: periodEnd,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      stripe_subscription_status: subscription.cancel_at_period_end
        ? "cancelling"
        : subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      max_staff: plan?.maxStaff ?? null,
      max_shops: plan?.maxShops ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (subErr) {
    throw new Error(`Failed to upsert Stripe subscription row: ${subErr.message}`);
  }
}

export async function recordStripeCheckoutPayment(
  supabase: Supabase,
  companyId: string,
  planSlug: PlanSlug,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const plan = planBySlug(planSlug);
  if (!plan?.amountCents) return;

  const reference = session.id;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_code", reference)
    .maybeSingle();

  if (existing) return;

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      company_id: companyId,
      plan_slug: planSlug,
      amount_cents: plan.amountCents,
      currency: "MYR",
      status: "paid",
      payment_method: "stripe",
      reference_code: reference,
      paid_at: now,
      notes: `Stripe Checkout ${reference}`,
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    console.error("Stripe payment record failed:", payErr);
    return;
  }

  await supabase.from("invoices").insert({
    company_id: companyId,
    payment_id: payment.id,
    invoice_number: nextInvoiceNumber(),
    plan_slug: planSlug,
    amount_cents: plan.amountCents,
    currency: "MYR",
    status: "paid",
    period_start: now,
    period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    paid_at: now,
  });
}

export type SubscriptionBillingDetails = Pick<
  SubscriptionRow,
  "plan_slug" | "payment_status" | "subscription_ends_at"
> & {
  next_billing_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_status: string | null;
};

export async function processStripeSubscriptionEvent(
  supabase: Supabase,
  subscription: Stripe.Subscription,
  hints?: {
    companyId?: string | null;
    customerEmail?: string | null;
    fallbackPlanSlug?: string | null;
  },
): Promise<CompanyRecord | null> {
  const company = await resolveCompanyForStripeSubscription(supabase, subscription, hints);
  if (!company) return null;

  await applyStripeSubscription(supabase, company.id, subscription, {
    fallbackPlanSlug: hints?.fallbackPlanSlug,
  });
  return company;
}

export async function processCheckoutSessionCompleted(
  supabase: Supabase,
  session: Stripe.Checkout.Session,
): Promise<CompanyRecord | null> {
  if (session.mode !== "subscription") return null;

  // 1. Find company by client_reference_id (falls back to email / Stripe IDs)
  const company = await resolveCompanyForCheckoutSession(supabase, session);
  if (!company) return null;

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!subscriptionId) return company;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });

  const priceId = subscription.items.data[0]?.price?.id;
  const planFromPrice = priceId ? planSlugFromStripePriceId(priceId) : null;
  const planFromItem = planSlugFromStripePrice(subscription.items.data[0]?.price);
  const planSlug = (session.metadata?.plan_slug?.trim() ||
    planFromItem ||
    planFromPrice ||
    "starter") as PlanSlug;

  // 2–6. Update plan, status=active, stripe IDs, current_period_end
  await applyStripeSubscription(supabase, company.id, subscription, { fallbackPlanSlug: planSlug });
  await recordStripeCheckoutPayment(supabase, company.id, planSlug, session);
  return company;
}

async function findCompletedCheckoutSessionForCompany(
  stripe: Stripe,
  company: CompanyRecord,
): Promise<Stripe.Checkout.Session | null> {
  let customerId = company.stripe_customer_id ?? null;
  const email = company.billing_contact_email?.trim() || company.email?.trim();

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    customerId = customers.data[0]?.id ?? null;
  }

  if (!customerId) return null;

  const byCustomer = await stripe.checkout.sessions.list({ customer: customerId, limit: 20 });
  const completed = byCustomer.data.filter(
    (session) =>
      session.status === "complete" &&
      session.mode === "subscription" &&
      session.payment_status === "paid",
  );

  return (
    completed.find((session) => session.client_reference_id === company.id) ?? completed[0] ?? null
  );
}

/** Fallback when webhooks are delayed or misconfigured — sync from Stripe Checkout. */
export async function syncCompanyBillingFromStripe(
  supabase: Supabase,
  company: CompanyRecord,
  opts?: { sessionId?: string | null },
): Promise<CompanyRecord | null> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured on this server.");
  }

  const stripe = getStripe();
  let session: Stripe.Checkout.Session | null = null;
  const sessionId = opts?.sessionId?.trim();

  if (sessionId) {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } else {
    session = await findCompletedCheckoutSessionForCompany(stripe, company);
  }

  if (!session || session.mode !== "subscription" || session.status !== "complete") {
    return null;
  }

  const resolved = await resolveCompanyForCheckoutSession(supabase, session);
  if (!resolved || resolved.id !== company.id) {
    throw new Error("Checkout session does not match your company account.");
  }

  return processCheckoutSessionCompleted(supabase, session);
}

export function subscriptionDisplayStatus(sub: {
  status: string;
  stripe_subscription_status?: string | null;
  cancel_at_period_end?: boolean;
}): string {
  if (
    sub.cancel_at_period_end ||
    sub.stripe_subscription_status === "cancelling"
  ) {
    return "Cancelling";
  }
  if (sub.stripe_subscription_status) {
    return sub.stripe_subscription_status.charAt(0).toUpperCase() + sub.stripe_subscription_status.slice(1);
  }
  return sub.status.charAt(0).toUpperCase() + sub.status.slice(1);
}

export async function cancelSubscriptionAtPeriodEnd(
  supabase: Supabase,
  company: CompanyRecord,
): Promise<void> {
  if (!company.stripe_subscription_id) {
    throw new Error("No active Stripe subscription found for this company.");
  }

  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(company.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  await applyStripeSubscription(supabase, company.id, updated);
}

export async function createCustomerPortalSession(
  company: CompanyRecord,
  returnPath = "/admin/billing",
): Promise<string> {
  if (!company.stripe_customer_id) {
    throw new Error("No Stripe customer on file. Subscribe to a plan first.");
  }

  const { getAppBaseUrl } = await import("@/lib/supabase/auth-url");
  const stripe = getStripe();
  const base = getAppBaseUrl();
  const returnUrl = `${base}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: returnUrl,
  });

  if (!session.url) {
    throw new Error("Stripe Customer Portal URL missing");
  }
  return session.url;
}

export async function syncStripeSubscriptionFromStripe(
  supabase: Supabase,
  params: {
    email?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  },
): Promise<{ company: CompanyRecord; subscriptionId: string }> {
  const stripe = getStripe();
  let company: CompanyRecord | null = null;
  let subscriptionId = params.stripeSubscriptionId?.trim() || null;

  const email = params.email?.trim();
  if (email) {
    company = await fetchCompanyByEmail(supabase, email);
  }

  const customerId = params.stripeCustomerId?.trim();
  if (!company && customerId) {
    company = await fetchCompanyByStripeCustomerId(supabase, customerId);
  }

  if (!subscriptionId && customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    subscriptionId = subs.data[0]?.id ?? null;
  }

  if (!subscriptionId) {
    throw new Error("Could not resolve a Stripe subscription. Provide subscription ID or customer ID.");
  }

  if (!company) {
    company = await fetchCompanyByStripeSubscriptionId(supabase, subscriptionId);
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });

  if (!company && subscription.customer) {
    const custEmail = await resolveCustomerEmail(subscription.customer);
    if (custEmail) {
      company = await fetchCompanyByEmail(supabase, custEmail);
    }
    if (!company && typeof subscription.customer === "string") {
      company = await fetchCompanyByStripeCustomerId(supabase, subscription.customer);
    }
  }

  if (!company) {
    throw new Error("No matching company found for the provided Stripe details.");
  }

  await applyStripeSubscription(supabase, company.id, subscription);
  return { company, subscriptionId };
}
