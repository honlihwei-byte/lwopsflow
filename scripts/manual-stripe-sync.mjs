/**
 * Manually sync a company subscription from the latest Stripe Checkout session.
 *
 * Usage:
 *   node scripts/manual-stripe-sync.mjs
 *   node scripts/manual-stripe-sync.mjs --company-id=c253ca3f-52ed-4281-ab11-ee605830dcac
 *   node scripts/manual-stripe-sync.mjs --email=owner@company.com
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  const env = { ...process.env };
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnvLocal();
const stripeKey = env.STRIPE_SECRET_KEY?.trim();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY is not set in .env.local or environment.");
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase env vars missing.");
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const DEFAULT_COMPANY_ID = "c253ca3f-52ed-4281-ab11-ee605830dcac";

const stripe = new Stripe(stripeKey);
const sb = createClient(supabaseUrl, supabaseKey);

function planFromAmount(amountCents, currency) {
  if (!amountCents || currency?.toLowerCase() !== "myr") return "starter";
  if (amountCents === 2900) return "starter";
  if (amountCents === 5900) return "growth";
  if (amountCents === 9900) return "business";
  return "starter";
}

async function findCompany() {
  if (args["company-id"]) {
    const { data } = await sb
      .from("companies")
      .select("*")
      .eq("id", args["company-id"])
      .maybeSingle();
    if (data) return data;
  }

  const email = args.email;
  if (email) {
    const { data: byEmail } = await sb
      .from("companies")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (byEmail) return byEmail;
  }

  const { data: byId } = await sb
    .from("companies")
    .select("*")
    .eq("id", DEFAULT_COMPANY_ID)
    .maybeSingle();
  return byId;
}

async function findLatestCheckoutSession(company) {
  const email = company.billing_contact_email?.trim() || company.email?.trim();
  let customerId = company.stripe_customer_id ?? null;

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 5 });
    customerId = customers.data[0]?.id ?? null;
    console.log("Stripe customers for email:", customers.data.map((c) => c.id).join(", ") || "none");
  }

  if (!customerId) {
    console.log("No Stripe customer found for", email || company.id);
    return null;
  }

  const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 20 });
  const completed = sessions.data.filter(
    (s) => s.status === "complete" && s.mode === "subscription" && s.payment_status === "paid",
  );

  console.log(
    "Completed checkout sessions:",
    completed.map((s) => ({
      id: s.id,
      created: new Date(s.created * 1000).toISOString(),
      client_reference_id: s.client_reference_id,
      subscription: s.subscription,
    })),
  );

  return (
    completed.find((s) => s.client_reference_id === company.id) ?? completed[0] ?? null
  );
}

async function applySubscription(company, subscription) {
  const item = subscription.items.data[0];
  const planSlug = planFromAmount(item?.price?.unit_amount, item?.price?.currency);
  const periodEndUnix =
    item?.current_period_end ??
    subscription.current_period_end ??
    Math.floor(Date.now() / 1000) + 30 * 86400;
  const periodEnd = new Date(periodEndUnix * 1000).toISOString();
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const priceId = item?.price?.id ?? null;
  const trialStartedAt = company.trial_started_at ?? new Date().toISOString();

  const planLimits = {
    starter: { max_shops: 3, max_staff: 30 },
    growth: { max_shops: 10, max_staff: 100 },
    business: { max_shops: null, max_staff: null },
  };
  const limits = planLimits[planSlug] ?? planLimits.starter;

  const { error: companyErr } = await sb
    .from("companies")
    .update({
      status: "active",
      active: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_ends_at: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", company.id);

  if (companyErr) throw new Error(`Company update failed: ${companyErr.message}`);

  const { error: subErr } = await sb.from("subscriptions").upsert(
    {
      company_id: company.id,
      user_id: company.auth_user_id ?? null,
      status: "active",
      plan_slug: planSlug,
      payment_status: "paid",
      trial_started_at: trialStartedAt,
      trial_ends_at: company.trial_ends_at,
      subscription_ends_at: periodEnd,
      current_period_end: periodEnd,
      next_billing_at: periodEnd,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      stripe_subscription_status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      max_shops: limits.max_shops,
      max_staff: limits.max_staff,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (subErr) throw new Error(`Subscription upsert failed: ${subErr.message}`);

  return { planSlug, periodEnd, customerId, subscriptionId: subscription.id };
}

async function main() {
  const company = await findCompany();
  if (!company) {
    console.error("Company not found.");
    process.exit(1);
  }

  console.log("Company:", {
    id: company.id,
    name: company.name,
    email: company.email,
    status: company.status,
  });

  const session = await findLatestCheckoutSession(company);
  if (!session) {
    console.error("No completed Stripe checkout session found.");
    process.exit(1);
  }

  console.log("Using checkout session:", session.id);

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!subscriptionId) {
    console.error("Checkout session has no subscription ID.");
    process.exit(1);
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });

  console.log("Stripe subscription:", {
    id: subscription.id,
    status: subscription.status,
    amount: subscription.items.data[0]?.price?.unit_amount,
    currency: subscription.items.data[0]?.price?.currency,
  });

  const result = await applySubscription(company, subscription);

  const { data: verifyCompany } = await sb
    .from("companies")
    .select("id, name, status, stripe_customer_id, stripe_subscription_id, subscription_ends_at")
    .eq("id", company.id)
    .single();

  const { data: verifySub } = await sb
    .from("subscriptions")
    .select("company_id, status, plan_slug, payment_status, stripe_subscription_id, next_billing_at")
    .eq("company_id", company.id)
    .single();

  console.log("\n=== SYNC COMPLETE ===");
  console.log(JSON.stringify({ applied: result, company: verifyCompany, subscription: verifySub }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
