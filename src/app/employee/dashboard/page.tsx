import { EmployeeDashboardClient } from "@/components/employee/EmployeeDashboardClient";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";

export default function EmployeeDashboardPage() {
  return (
    <EmployeeSessionGate>
      <EmployeeDashboardClient />
    </EmployeeSessionGate>
  );
}
