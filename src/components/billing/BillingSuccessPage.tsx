"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";

type BillingSummary = {
  plan_name: string;
  subscription_status: string;
  plan_slug: string;
};

export function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const syncedRef = useRef(false);
  const [sub, setSub] = useState<BillingSummary | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/company/billing", { credentials: "include" });
    const j = await res.json();
    if (res.ok && j.subscription) {
      setSub({
        plan_name: j.subscription.plan_name,
        subscription_status: j.subscription.subscription_status,
        plan_slug: j.subscription.plan_slug,
      });
    }
  }, []);

  const syncFromStripe = useCallback(async () => {
    const res = await fetch("/api/company/billing/sync-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ session_id: sessionId ?? "" }),
    });
    const j = await res.json();
    if (res.ok && j.synced) {
      setSyncMessage("Subscription activated.");
      await load();
      return true;
    }
    if (res.status === 503) {
      setSyncMessage("Stripe is not configured on this server yet. Contact support.");
      return false;
    }
    if (!j.synced) {
      setSyncMessage(j.error || "Still waiting for Stripe confirmation…");
    }
    return false;
  }, [load, sessionId]);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    void (async () => {
      await syncFromStripe();
      await load();
    })();
  }, [load, syncFromStripe]);

  useEffect(() => {
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  const stillTrial = sub?.plan_slug === "trial";

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-8 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="text-4xl" aria-hidden="true">
          ✓
        </p>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Payment successful
        </h1>
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
          {stillTrial
            ? "Stripe payment received. We are syncing your Starter subscription now."
            : "Your plan has been activated."}
        </p>
        {syncMessage ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{syncMessage}</p>
        ) : null}
        <dl className="mt-6 space-y-2 rounded-xl bg-white/80 px-4 py-4 text-left text-sm dark:bg-zinc-900/60">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Current plan</dt>
            <dd className="font-semibold">{sub?.plan_name ?? "Loading…"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Subscription status</dt>
            <dd className="font-semibold">{sub?.subscription_status ?? "Loading…"}</dd>
          </div>
        </dl>
        {stillTrial ? (
          <button
            type="button"
            onClick={() => void syncFromStripe()}
            className="mt-4 text-sm font-medium text-[#2563EB] hover:underline"
          >
            Sync subscription again
          </button>
        ) : null}
        <Link href="/admin/billing" className={btnPrimary("mt-8 inline-flex")}>
          Go to Billing
        </Link>
      </div>
    </div>
  );
}
