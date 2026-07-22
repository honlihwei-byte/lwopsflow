import { AdminSessionGate } from "@/components/admin/AdminSessionGate";

export default function SubscriptionRequiredLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminSessionGate requiredRole="company_admin">{children}</AdminSessionGate>;
}
