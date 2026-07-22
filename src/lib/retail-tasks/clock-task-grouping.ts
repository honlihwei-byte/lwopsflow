import { isTaskOverdue, displayTaskStatus } from "@/lib/retail-tasks/task-status";
import type { RetailTaskListItem, TaskStatus } from "@/lib/retail-tasks/types";

const WORKABLE: TaskStatus[] = ["pending", "in_progress", "rejected"];

const DUE_SOON_MS = 60 * 60 * 1000;

export function taskDueAtMs(dueDate: string, dueTime: string | null): number {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  return new Date(`${dueDate}T${timePart}:00+08:00`).getTime();
}

export function isTaskDueSoon(
  dueDate: string,
  dueTime: string | null,
  status: TaskStatus,
  now = new Date(),
): boolean {
  if (!WORKABLE.includes(status)) return false;
  if (isTaskOverdue(dueDate, dueTime, status, now)) return false;
  const msUntil = taskDueAtMs(dueDate, dueTime) - now.getTime();
  return msUntil > 0 && msUntil <= DUE_SOON_MS;
}

export type ClockTaskSection = "overdue" | "due_soon" | "in_progress" | "pending";

export function clockTaskSection(
  task: RetailTaskListItem,
  now = new Date(),
): ClockTaskSection | null {
  const dbStatus = task.status;
  if (!WORKABLE.includes(dbStatus)) return null;

  const display = (task.display_status ?? displayTaskStatus(dbStatus, task.due_date, task.due_time)) as TaskStatus;
  if (display === "overdue" || isTaskOverdue(task.due_date, task.due_time, dbStatus, now)) {
    return "overdue";
  }
  if (isTaskDueSoon(task.due_date, task.due_time, dbStatus, now)) return "due_soon";
  if (dbStatus === "in_progress") return "in_progress";
  return "pending";
}

export function groupClockTasks(
  tasks: RetailTaskListItem[],
  now = new Date(),
): Record<ClockTaskSection, RetailTaskListItem[]> {
  const groups: Record<ClockTaskSection, RetailTaskListItem[]> = {
    overdue: [],
    due_soon: [],
    in_progress: [],
    pending: [],
  };
  for (const task of tasks) {
    const section = clockTaskSection(task, now);
    if (section) groups[section].push(task);
  }
  return groups;
}

export function isUnfinishedClockTask(task: RetailTaskListItem): boolean {
  return WORKABLE.includes(task.status) || isTaskOverdue(task.due_date, task.due_time, task.status);
}

export function countUnfinishedClockTasks(tasks: RetailTaskListItem[]): number {
  return tasks.filter(isUnfinishedClockTask).length;
}
