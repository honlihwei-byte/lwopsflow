import { Suspense } from "react";
import dynamic from "next/dynamic";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const OperationsDashboard = dynamic(
  () =>
    import("@/components/admin/OperationsDashboard").then((m) => ({
      default: m.OperationsDashboard,
    })),
  { loading: () => <I18nLoadingText messageKey="loading.generic" /> },
);

export default function EmployeeOpsDashboardPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="dashboard">
        <Suspense fallback={<I18nLoadingText messageKey="loading.generic" />}>
          <OperationsDashboard />
        </Suspense>
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
