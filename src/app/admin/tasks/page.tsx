import { Suspense } from "react";
import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const TasksManager = dynamic(
  () => import("@/components/admin/tasks/TasksManager").then((m) => ({ default: m.TasksManager })),
  { loading: () => <I18nLoadingText messageKey="loading.generic" /> },
);

export default function TasksAdminPage() {
  return (
    <Suspense fallback={<I18nLoadingText messageKey="loading.generic" />}>
      <TasksManager />
    </Suspense>
  );
}
