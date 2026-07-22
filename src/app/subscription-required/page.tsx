import type { Metadata } from "next";
import { SubscriptionRequiredPage } from "@/components/subscription/SubscriptionRequiredPage";

export const metadata: Metadata = {
  title: "Subscription required — Punch Card System",
};

export default function Page() {
  return <SubscriptionRequiredPage />;
}
