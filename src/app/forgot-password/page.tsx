import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Forgot password — Punch Card System",
};

export default function ForgotPasswordPage() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <ForgotPasswordForm />
      </Suspense>
    </MarketingShell>
  );
}
