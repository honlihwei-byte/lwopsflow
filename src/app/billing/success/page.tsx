import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSuccessPage } from "@/components/billing/BillingSuccessPage";

export const metadata: Metadata = {
  title: "Payment successful — OpsFlow",
};

export default function Page() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">Loading…</p>}>
      <BillingSuccessPage />
    </Suspense>
  );
}
