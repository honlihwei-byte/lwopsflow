import dynamic from "next/dynamic";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const StaffManager = dynamic(
  () => import("@/app/admin/staff/StaffManager").then((m) => ({ default: m.StaffManager })),
  { loading: () => <I18nLoadingText messageKey="loading.staff" /> },
);

export default function EmployeeOpsStaffPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="employees">
        <StaffManager />
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
