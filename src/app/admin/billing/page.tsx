import type { Metadata } from "next";
import { BillingManagementPage } from "@/components/billing/BillingManagementPage";

export const metadata: Metadata = {
  title: "Billing — OpsFlow Admin",
};

export default function Page() {
  return <BillingManagementPage />;
}
