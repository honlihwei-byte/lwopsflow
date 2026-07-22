import { EmployeeAccountSettings } from "@/components/employee/EmployeeAccountSettings";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";

export default function EmployeeAccountSettingsPage() {
  return (
    <EmployeeSessionGate>
      <EmployeeAccountSettings />
    </EmployeeSessionGate>
  );
}
