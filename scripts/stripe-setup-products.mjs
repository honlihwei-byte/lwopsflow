/**
 * Create Stripe products and monthly MYR prices for OpsFlow plans.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup-products.mjs
 *
 * Add the printed price IDs to .env.local / Vercel env vars.
 */
import Stripe from "stripe";

const PLANS = [
  {
    slug: "starter",
    name: "OpsFlow Starter",
    description: "3 shops · 30 staff · Full features included",
    amount: 2900,
    envKey: "STRIPE_PRICE_STARTER",
  },
  {
    slug: "growth",
    name: "OpsFlow Growth",
    description: "10 shops · 100 staff · Full features included",
    amount: 5900,
    envKey: "STRIPE_PRICE_GROWTH",
  },
  {
    slug: "business",
    name: "OpsFlow Business",
    description: "Unlimited shops · Unlimited staff · Full features included",
    amount: 9900,
    envKey: "STRIPE_PRICE_BUSINESS",
  },
];

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY before running this script.");
  process.exit(1);
}

const stripe = new Stripe(key);

console.log("Creating Stripe products and prices for OpsFlow…\n");

for (const plan of PLANS) {
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { plan_slug: plan.slug },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: "myr",
    unit_amount: plan.amount,
    recurring: { interval: "month" },
    metadata: { plan_slug: plan.slug },
  });

  console.log(`${plan.name}`);
  console.log(`  Product: ${product.id}`);
  console.log(`  Price:   ${price.id}`);
  console.log(`  Env:     ${plan.envKey}=${price.id}\n`);
}

console.log("Done. Copy the env lines above into .env.local and Vercel.");
console.log("Register webhook endpoint: POST /api/stripe/webhook");
console.log("Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted");
