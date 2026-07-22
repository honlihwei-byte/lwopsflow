import type { Metadata } from "next";
import { CompanyProfilePanel } from "@/components/admin/CompanyProfilePanel";

export const metadata: Metadata = {
  title: "Company Profile — LW OpsFlow",
};

export default function CompanyProfilePage() {
  return <CompanyProfilePanel />;
}
