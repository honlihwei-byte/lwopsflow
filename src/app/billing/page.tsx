import type { Metadata } from "next";
import { BillingPage } from "@/components/billing/BillingPage";

export const metadata: Metadata = {
  title: "Billing — Punch Card System",
};

export default function Page() {
  return <BillingPage />;
}
