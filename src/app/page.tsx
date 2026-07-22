import type { Metadata } from "next";
import { HomeLanding } from "@/components/marketing/HomeLanding";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Manage Every Outlet With Data, Not Guesswork！！",
  description:
    "LW OpsFlow is a Retail Operations Intelligence Platform. Track attendance, task completion, reliability scores, and outlet performance — all in one dashboard. 14-day free trial.",
};

export default function Home() {
  return (
    <MarketingShell>
      <HomeLanding />
    </MarketingShell>
  );
}
