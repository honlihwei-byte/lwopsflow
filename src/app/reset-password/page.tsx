import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Reset password — Punch Card System",
};

export default function ResetPasswordPage() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </MarketingShell>
  );
}
