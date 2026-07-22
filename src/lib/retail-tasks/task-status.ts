import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { resolveDisplayTaskStatus } from "@/lib/retail-tasks/task-overdue";
import type { TaskStatus } from "@/lib/retail-tasks/types";

export function isTaskOverdue(
  dueDate: string,
  dueTime: string | null,
  status: TaskStatus,
  now = new Date(),
): boolean {
  if (
    status === "missed" ||
    status === "verified" ||
    status === "fair" ||
    status === "exception_reported" ||
    status === "submitted" ||
    status === "submitted_late"
  ) {
    return false;
  }
  const active = ["pending", "in_progress", "rejected"].includes(status);
  if (!active) return false;

  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  const due = new Date(`${dueDate}T${timePart}:00+08:00`);
  return now.getTime() > due.getTime();
}

/** True when the task due moment (Malaysia) has passed — used for resume eligibility. */
export function isTaskPastDueDate(
  dueDate: string,
  dueTime: string | null,
  now = new Date(),
): boolean {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  const due = new Date(`${dueDate}T${timePart}:00+08:00`);
  return now.getTime() > due.getTime();
}

export function displayTaskStatus(
  status: TaskStatus,
  dueDate: string,
  dueTime: string | null,
  submittedAt?: string | null,
): TaskStatus {
  return resolveDisplayTaskStatus({
    status,
    due_date: dueDate,
    due_time: dueTime,
    submitted_at: submittedAt,
  });
}

export const TASK_STATUS_CLASSES: Record<TaskStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 border-zinc-200",
  in_progress: "bg-blue-100 text-blue-900 border-blue-200",
  submitted: "bg-amber-100 text-amber-900 border-amber-200",
  submitted_late: "bg-orange-100 text-orange-950 border-orange-300",
  verified: "bg-emerald-100 text-emerald-900 border-emerald-200",
  fair: "bg-amber-100 text-amber-900 border-amber-200",
  rejected: "bg-red-100 text-red-900 border-red-200",
  overdue: "bg-orange-100 text-orange-900 border-orange-200",
  exception_reported: "bg-purple-100 text-purple-900 border-purple-200",
  missed: "bg-slate-200 text-slate-800 border-slate-300",
};

export function todayYmd(): string {
  return malaysiaDateYmd(new Date());
}
