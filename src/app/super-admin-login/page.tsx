import type { Metadata } from "next";
import { Suspense } from "react";
import { SuperAdminLoginForm } from "@/components/auth/SuperAdminLoginForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Platform sign in",
  robots: { index: false, follow: false },
};

export default function SuperAdminLoginPage() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <SuperAdminLoginForm />
      </Suspense>
    </MarketingShell>
  );
}
