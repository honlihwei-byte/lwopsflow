import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";

export default function EmployeeOpsBillingPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="billing">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="text-sm text-zinc-600">
            Billing management is restricted. Please contact your Company Admin for subscription
            and invoice questions.
          </p>
        </div>
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
