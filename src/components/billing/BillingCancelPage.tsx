"use client";

import Link from "next/link";
import { btnPrimary } from "@/components/marketing/MarketingShell";

export function BillingCancelPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-8 shadow-sm dark:border-amber-900 dark:bg-amber-950/40">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Payment not completed
        </h1>
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
          Your payment was not completed. Your account was not charged.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          You can return to billing and try again whenever you are ready.
        </p>
        <Link href="/admin/billing" className={btnPrimary("mt-8 inline-flex")}>
          Back to Billing
        </Link>
      </div>
    </div>
  );
}
