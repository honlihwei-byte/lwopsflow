import { Suspense } from "react";
import dynamic from "next/dynamic";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const TasksManager = dynamic(
  () => import("@/components/admin/tasks/TasksManager").then((m) => ({ default: m.TasksManager })),
  { loading: () => <I18nLoadingText messageKey="loading.generic" /> },
);

export default function EmployeeOpsTasksPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="tasks">
        <Suspense fallback={<I18nLoadingText messageKey="loading.generic" />}>
          <TasksManager />
        </Suspense>
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
