"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { taskKindI18nKey, taskKind as resolveTaskKind, type TaskKind } from "@/lib/retail-tasks/task-kind";
import type { RetailTaskRow } from "@/lib/retail-tasks/types";

function badgeClass(kind: TaskKind): string {
  switch (kind) {
    case "one_time":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    case "daily_recurring":
      return "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200";
    case "weekly_recurring":
      return "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200";
    case "series_generated":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200";
  }
}

export function TaskKindBadge({
  task,
  kind,
}: {
  task?: Pick<RetailTaskRow, "repeat_type" | "series_id" | "materialized_by">;
  kind?: TaskKind;
}) {
  const { t } = useI18n();
  const resolved = kind ?? (task ? resolveTaskKind(task) : "one_time");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(resolved)}`}
    >
      {t(taskKindI18nKey(resolved))}
    </span>
  );
}
