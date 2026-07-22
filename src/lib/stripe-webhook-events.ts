import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type StripeEventLogStatus = "received" | "processed" | "failed" | "skipped";

export async function findProcessedStripeEvent(
  supabase: Supabase,
  stripeEventId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("stripe_webhook_events")
    .select("processing_status")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  return data?.processing_status === "processed" || data?.processing_status === "skipped";
}

export async function logStripeWebhookEvent(
  supabase: Supabase,
  params: {
    stripeEventId: string;
    eventType: string;
    payload: Stripe.Event;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    companyId?: string | null;
    customerEmail?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("stripe_webhook_events").upsert(
    {
      stripe_event_id: params.stripeEventId,
      event_type: params.eventType,
      stripe_customer_id: params.stripeCustomerId ?? null,
      stripe_subscription_id: params.stripeSubscriptionId ?? null,
      company_id: params.companyId ?? null,
      customer_email: params.customerEmail ?? null,
      payload: params.payload as unknown as Record<string, unknown>,
      processing_status: "received",
      error_message: null,
      processed_at: null,
    },
    { onConflict: "stripe_event_id", ignoreDuplicates: false },
  );

  if (error) {
    console.error("Failed to log Stripe webhook event:", error);
  }
}

export async function markStripeWebhookEvent(
  supabase: Supabase,
  stripeEventId: string,
  status: StripeEventLogStatus,
  errorMessage?: string | null,
  companyId?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    processing_status: status,
    error_message: errorMessage ?? null,
    processed_at: new Date().toISOString(),
  };
  if (companyId) patch.company_id = companyId;

  const { error } = await supabase
    .from("stripe_webhook_events")
    .update(patch)
    .eq("stripe_event_id", stripeEventId);

  if (error) {
    console.error("Failed to update Stripe webhook event log:", error);
  }
}
