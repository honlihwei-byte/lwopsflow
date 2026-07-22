"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { TASK_STATUS_CLASSES } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TASK_STATUS_CLASSES[status]}`}
    >
      {t(`tasks.status.${status}`)}
    </span>
  );
}
