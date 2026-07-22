import { addDaysYmd } from "@/lib/attendance";
import { taskDueInstant } from "@/lib/retail-tasks/task-scoring";
import { isTaskPastDueDate } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";

/** Days after due date before auto-marking pending work as missed. */
export const TASK_MISSED_AFTER_DAYS = 14;

/** How far back staff task lists include overdue open tasks. */
export const TASK_OVERDUE_LIST_LOOKBACK_DAYS = 30;

export function taskMissedCutoffYmd(todayYmd: string): string {
  return addDaysYmd(todayYmd, -TASK_MISSED_AFTER_DAYS);
}

export function staffTaskListFromYmd(todayYmd: string): string {
  return addDaysYmd(todayYmd, -TASK_OVERDUE_LIST_LOOKBACK_DAYS);
}

export function minutesLate(
  submittedAt: string,
  dueDate: string,
  dueTime: string | null,
): number {
  const due = taskDueInstant(dueDate, dueTime);
  const submitted = new Date(submittedAt);
  return Math.max(0, Math.round((submitted.getTime() - due.getTime()) / 60_000));
}

export function formatOverdueDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

export function isSubmissionLate(
  submittedAt: string | null | undefined,
  dueDate: string,
  dueTime: string | null,
): boolean {
  if (!submittedAt) return false;
  return new Date(submittedAt).getTime() > taskDueInstant(dueDate, dueTime).getTime();
}

export function taskWasOverdueAtSubmit(
  dueDate: string,
  dueTime: string | null,
  now = new Date(),
): boolean {
  return isTaskPastDueDate(dueDate, dueTime, now);
}

export function resolveDisplayTaskStatus(params: {
  status: TaskStatus;
  due_date: string;
  due_time: string | null;
  submitted_at?: string | null;
}): TaskStatus {
  if (params.status === "missed") return "missed";
  if (params.status === "submitted") {
    if (isSubmissionLate(params.submitted_at, params.due_date, params.due_time)) {
      return "submitted_late";
    }
    return "submitted";
  }
  if (
    ["pending", "in_progress", "rejected"].includes(params.status) &&
    isTaskPastDueDate(params.due_date, params.due_time)
  ) {
    return "overdue";
  }
  return params.status;
}

export const WORKABLE_TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "rejected", "missed"];
