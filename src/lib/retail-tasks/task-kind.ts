import type { RetailTaskListItem, RetailTaskRow, TaskRepeatType } from "@/lib/retail-tasks/types";

export type TaskKind =
  | "one_time"
  | "daily_recurring"
  | "weekly_recurring"
  | "series_generated";

export function isRecurringTask(
  task: Pick<RetailTaskRow, "repeat_type" | "series_id">,
): boolean {
  return Boolean(task.series_id) && task.repeat_type !== "one_time";
}

/** Visible task-type label for admin and staff lists. */
export function taskKind(
  task: Pick<RetailTaskRow, "repeat_type" | "series_id" | "materialized_by">,
): TaskKind {
  if (task.materialized_by === "scheduler") return "series_generated";
  if (!task.series_id || task.repeat_type === "one_time") return "one_time";
  if (task.repeat_type === "daily" || task.repeat_type === "monthly") return "daily_recurring";
  if (task.repeat_type === "weekly") return "weekly_recurring";
  return "one_time";
}

export function taskKindI18nKey(kind: TaskKind): string {
  return `tasks.taskKind.${kind}`;
}

export function repeatTypeLabelKey(repeatType: TaskRepeatType): string {
  return `tasks.repeat.${repeatType}`;
}

export type TaskDeleteScope = "occurrence" | "future";

export function deleteScopeOptions(
  task: Pick<RetailTaskRow, "repeat_type" | "series_id">,
): TaskDeleteScope[] {
  if (!isRecurringTask(task)) return ["occurrence"];
  return ["occurrence", "future"];
}

export function taskSupportsKindBadge(task: RetailTaskListItem | RetailTaskRow): boolean {
  return true;
}
