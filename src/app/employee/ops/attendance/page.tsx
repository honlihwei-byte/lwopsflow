import { Suspense } from "react";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";
import { AdminAttendancePage } from "@/app/admin/attendance/AdminAttendancePage";

export default function EmployeeOpsAttendancePage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="attendance">
        <Suspense fallback={<I18nLoadingText messageKey="loading.attendance" />}>
          <AdminAttendancePage />
        </Suspense>
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
