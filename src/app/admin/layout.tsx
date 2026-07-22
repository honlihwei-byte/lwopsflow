import { AdminSessionGate } from "@/components/admin/AdminSessionGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionGate requiredRole="company_admin">{children}</AdminSessionGate>;
}
