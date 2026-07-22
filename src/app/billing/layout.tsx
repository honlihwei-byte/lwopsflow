import { AdminSessionGate } from "@/components/admin/AdminSessionGate";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionGate requiredRole="company_admin">{children}</AdminSessionGate>;
}
