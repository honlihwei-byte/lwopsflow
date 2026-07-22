import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyLoginForm } from "@/components/auth/CompanyLoginForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Company Login",
};

export default function LoginPage() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <CompanyLoginForm />
      </Suspense>
    </MarketingShell>
  );
}
