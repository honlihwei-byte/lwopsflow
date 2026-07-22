import type { Metadata } from "next";
import { BillingCancelPage } from "@/components/billing/BillingCancelPage";

export const metadata: Metadata = {
  title: "Payment cancelled — OpsFlow",
};

export default function Page() {
  return <BillingCancelPage />;
}
