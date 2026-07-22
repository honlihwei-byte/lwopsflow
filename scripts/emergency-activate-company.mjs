/**
 * Emergency DB activation when Stripe API key is unavailable locally.
 * Sets Testing Company 2 (or --company-id) to starter / active.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const companyId =
  process.argv.find((a) => a.startsWith("--company-id="))?.split("=")[1] ??
  "c253ca3f-52ed-4281-ab11-ee605830dcac";

const planSlug = "starter";
const maxShops = 3;
const maxStaff = 30;
const now = new Date();
const subEnd = new Date(now);
subEnd.setDate(subEnd.getDate() + 30);

const { data: company, error: loadErr } = await sb
  .from("companies")
  .select("id, name, email, status, trial_started_at, trial_ends_at, auth_user_id")
  .eq("id", companyId)
  .single();

if (loadErr || !company) {
  console.error("Company not found:", loadErr?.message);
  process.exit(1);
}

console.log("Before:", company);

const trialStartedAt = company.trial_started_at ?? now.toISOString();

const { error: companyErr } = await sb
  .from("companies")
  .update({
    status: "active",
    active: true,
    subscription_ends_at: subEnd.toISOString(),
    updated_at: now.toISOString(),
  })
  .eq("id", companyId);

if (companyErr) {
  console.error("Company update failed:", companyErr.message);
  process.exit(1);
}

const { error: subErr } = await sb.from("subscriptions").upsert(
  {
    company_id: companyId,
    user_id: company.auth_user_id ?? null,
    status: "active",
    plan_slug: planSlug,
    payment_status: "paid",
    trial_started_at: trialStartedAt,
    trial_ends_at: company.trial_ends_at,
    subscription_ends_at: subEnd.toISOString(),
    updated_at: now.toISOString(),
  },
  { onConflict: "company_id" },
);

if (subErr) {
  console.error("Subscription upsert failed:", subErr.message);
  process.exit(1);
}

const { data: afterCompany } = await sb
  .from("companies")
  .select("id, name, status, active, subscription_ends_at, stripe_customer_id, stripe_subscription_id")
  .eq("id", companyId)
  .single();

const { data: afterSub } = await sb
  .from("subscriptions")
  .select("company_id, status, plan_slug, payment_status, next_billing_at, stripe_subscription_id")
  .eq("company_id", companyId)
  .single();

console.log("\n=== ACTIVATED ===");
console.log(JSON.stringify({ company: afterCompany, subscription: afterSub }, null, 2));
