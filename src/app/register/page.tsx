import type { Metadata } from "next";
import { CompanyRegisterForm } from "@/components/auth/CompanyRegisterForm";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Start Free Trial — Punch Card System",
};

export default function RegisterPage() {
  return (
    <MarketingShell>
      <CompanyRegisterForm />
    </MarketingShell>
  );
}
