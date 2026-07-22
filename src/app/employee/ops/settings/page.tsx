import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import Link from "next/link";

export default function EmployeeOpsSettingsPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="settings">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-zinc-600">
            Company profile and security settings are managed from the admin portal. Contact
            your Company Admin if you need changes.
          </p>
          <Link href="/employee/dashboard" className="text-sm font-semibold text-emerald-700 underline">
            Back to dashboard
          </Link>
        </div>
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
