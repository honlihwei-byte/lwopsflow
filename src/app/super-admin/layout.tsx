import { AdminSessionGate } from "@/components/admin/AdminSessionGate";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionGate requiredRole="super_admin">{children}</AdminSessionGate>;
}
