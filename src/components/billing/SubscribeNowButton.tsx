"use client";

import { useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";
import type { PlanSlug } from "@/lib/subscription-plans";

type Props = {
  planSlug: PlanSlug;
  className?: string;
  disabled?: boolean;
};

export function SubscribeNowButton({ planSlug, className, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/company/billing/choose-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_slug: planSlug }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || "Could not open payment page");
        return;
      }
      if (j.payment_url) {
        window.open(j.payment_url, "_blank");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleSubscribe()}
      className={btnPrimary(className ?? "mt-4 w-full disabled:opacity-50")}
    >
      {loading ? "Opening payment…" : "Subscribe Now"}
    </button>
  );
}
