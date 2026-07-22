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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

async function show(label, query) {
  const result = await query();
  console.log(`\n=== ${label} ===`);
  if (result.error) {
    console.log("ERROR:", result.error.message, result.error.code);
    return;
  }
  console.log(JSON.stringify(result.data, null, 2));
}

await show("Latest Stripe webhook events", () =>
  sb
    .from("stripe_webhook_events")
    .select(
      "stripe_event_id, event_type, customer_email, company_id, processing_status, error_message, created_at, processed_at",
    )
    .order("created_at", { ascending: false })
    .limit(10),
);

await show("Subscriptions with Stripe IDs", () =>
  sb
    .from("subscriptions")
    .select(
      "company_id, status, plan_slug, payment_status, stripe_subscription_id, stripe_customer_id, current_period_end, next_billing_at",
    )
    .not("stripe_subscription_id", "is", null)
    .limit(10),
);

await show("Companies trial but have stripe sub", () =>
  sb
    .from("companies")
    .select(
      "id, name, email, billing_contact_email, status, stripe_customer_id, stripe_subscription_id, active",
    )
    .eq("status", "trial")
    .not("stripe_subscription_id", "is", null)
    .limit(10),
);

await show("Failed webhook events", () =>
  sb
    .from("stripe_webhook_events")
    .select("stripe_event_id, event_type, customer_email, error_message, created_at")
    .eq("processing_status", "failed")
    .order("created_at", { ascending: false })
    .limit(10),
);

await show("All companies (status)", () =>
  sb
    .from("companies")
    .select("id, name, email, billing_contact_email, status, stripe_customer_id, stripe_subscription_id, active, created_at")
    .order("created_at", { ascending: false })
    .limit(15),
);

await show("All subscriptions", () =>
  sb
    .from("subscriptions")
    .select("company_id, status, plan_slug, payment_status, stripe_subscription_id, stripe_customer_id")
    .limit(15),
);

await show("Testing Company 2 subscription", () =>
  sb
    .from("subscriptions")
    .select("*")
    .eq("company_id", "c253ca3f-52ed-4281-ab11-ee605830dcac"),
);

// probe stripe columns exist
await show("subscriptions column probe", () =>
  sb.from("subscriptions").select("cancel_at_period_end, current_period_end, stripe_subscription_id").limit(1),
);
