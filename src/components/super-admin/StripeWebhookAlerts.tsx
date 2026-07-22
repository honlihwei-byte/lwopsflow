"use client";

import { useCallback, useEffect, useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/marketing/MarketingShell";

type WebhookEvent = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  customer_email: string | null;
  processing_status: string;
  error_message: string | null;
  created_at: string;
};

export function StripeWebhookAlerts() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncCustomerId, setSyncCustomerId] = useState("");
  const [syncSubscriptionId, setSyncSubscriptionId] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/super-admin/stripe-webhooks", { credentials: "include" });
    const j = await res.json();
    if (res.ok) {
      setEvents(j.events ?? []);
      setFailedCount(j.failed_count ?? 0);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSync() {
    setSyncBusy(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/super-admin/companies", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_stripe_subscription",
          email: syncEmail.trim() || undefined,
          stripe_customer_id: syncCustomerId.trim() || undefined,
          stripe_subscription_id: syncSubscriptionId.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Sync failed");
      setSyncMessage(`Synced ${j.company_name} (${j.stripe_subscription_id})`);
      await load();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Stripe webhook alerts</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Failed webhook events:{" "}
          <strong className={failedCount > 0 ? "text-red-700 dark:text-red-400" : ""}>
            {failedCount}
          </strong>
        </p>
      </div>

      {failedCount > 0 ? (
        <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
          {events
            .filter((e) => e.processing_status === "failed")
            .map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 dark:border-red-900 dark:bg-zinc-950"
              >
                <span className="font-mono">{e.event_type}</span> · {e.customer_email ?? "no email"}
                {e.error_message ? (
                  <p className="mt-1 text-red-700 dark:text-red-400">{e.error_message}</p>
                ) : null}
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">No failed webhook events.</p>
      )}

      <div className="border-t border-amber-200 pt-4 dark:border-amber-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Sync Stripe subscription (fallback)
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Manually pull subscription state from Stripe when webhook activation failed.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={syncEmail}
            onChange={(e) => setSyncEmail(e.target.value)}
            placeholder="Customer email"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <input
            value={syncCustomerId}
            onChange={(e) => setSyncCustomerId(e.target.value)}
            placeholder="stripe_customer_id"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-900"
          />
          <input
            value={syncSubscriptionId}
            onChange={(e) => setSyncSubscriptionId(e.target.value)}
            placeholder="stripe_subscription_id"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncBusy}
            onClick={() => void runSync()}
            className={btnPrimary("text-sm disabled:opacity-50")}
          >
            {syncBusy ? "Syncing…" : "Sync Stripe subscription"}
          </button>
        </div>
        {syncMessage ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{syncMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
