import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  processCheckoutSessionCompleted,
  processStripeSubscriptionEvent,
  resolveCustomerEmail,
} from "@/lib/stripe-billing";
import {
  findProcessedStripeEvent,
  logStripeWebhookEvent,
  markStripeWebhookEvent,
} from "@/lib/stripe-webhook-events";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function extractStripeIds(event: Stripe.Event): {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  customerEmail: string | null;
} {
  const obj = event.data.object as unknown as Record<string, unknown>;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let customerEmail: string | null = null;

  if (typeof obj.customer === "string") {
    stripeCustomerId = obj.customer;
  } else if (obj.customer && typeof obj.customer === "object" && "id" in obj.customer) {
    stripeCustomerId = String((obj.customer as { id: string }).id);
    if ("email" in obj.customer && (obj.customer as { email?: string }).email) {
      customerEmail = String((obj.customer as { email?: string }).email);
    }
  }

  if (typeof obj.subscription === "string") {
    stripeSubscriptionId = obj.subscription;
  } else if (obj.id && event.type.startsWith("customer.subscription.")) {
    stripeSubscriptionId = String(obj.id);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    customerEmail =
      session.customer_details?.email?.trim() ||
      session.customer_email?.trim() ||
      customerEmail;
    if (!stripeSubscriptionId && session.subscription) {
      stripeSubscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
    }
  }

  return { stripeCustomerId, stripeSubscriptionId, customerEmail };
}

async function dispatchStripeEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
): Promise<{ companyId: string | null; skipped?: boolean }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const company = await processCheckoutSessionCompleted(
        supabase,
        event.data.object as Stripe.Checkout.Session,
      );
      return { companyId: company?.id ?? null };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const email = await resolveCustomerEmail(subscription.customer);
      const company = await processStripeSubscriptionEvent(supabase, subscription, {
        customerEmail: email,
      });
      return { companyId: company?.id ?? null };
    }
    default:
      return { companyId: null, skipped: true };
  }
}

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    console.error("[Stripe webhook] STRIPE_SECRET_KEY is not configured");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = getStripeWebhookSecret();
  } catch (err) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET is not configured:", err);
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { stripeCustomerId, stripeSubscriptionId, customerEmail } = extractStripeIds(event);

  console.info(`[Stripe webhook] ${event.type} (${event.id})`);

  if (await findProcessedStripeEvent(supabase, event.id)) {
    console.info(`[Stripe webhook] Skipping duplicate event ${event.id}`);
    await logStripeWebhookEvent(supabase, {
      stripeEventId: event.id,
      eventType: event.type,
      payload: event,
      stripeCustomerId,
      stripeSubscriptionId,
      customerEmail,
    });
    await markStripeWebhookEvent(supabase, event.id, "skipped", "Duplicate event");
    return NextResponse.json({ received: true, duplicate: true });
  }

  await logStripeWebhookEvent(supabase, {
    stripeEventId: event.id,
    eventType: event.type,
    payload: event,
    stripeCustomerId,
    stripeSubscriptionId,
    customerEmail,
  });

  try {
    const result = await dispatchStripeEvent(supabase, event);

    if (result.skipped) {
      await markStripeWebhookEvent(
        supabase,
        event.id,
        "skipped",
        `Unhandled event type: ${event.type}`,
        result.companyId,
      );
      return NextResponse.json({ received: true, handled: false });
    }

    if (!result.companyId) {
      const msg = `No company matched for ${event.type} (email: ${customerEmail ?? "unknown"})`;
      console.warn(`[Stripe webhook] ${msg}`);
      await markStripeWebhookEvent(supabase, event.id, "failed", msg);
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    console.info(
      `[Stripe webhook] Processed ${event.type} for company ${result.companyId}`,
    );
    await markStripeWebhookEvent(supabase, event.id, "processed", null, result.companyId);
    return NextResponse.json({ received: true, company_id: result.companyId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe webhook] Handler error (${event.type}):`, err);
    await markStripeWebhookEvent(supabase, event.id, "failed", message);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
