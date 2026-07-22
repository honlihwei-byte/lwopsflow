import { notifyTaskAssigned } from "@/lib/notifications/task-assigned-notify";
import { dispatchToMany } from "@/lib/notifications/notification-service";
import { resolveTaskNotificationRecipients } from "@/lib/notifications/task-recipient-resolver";
import { loadTaskSeriesNotificationSettings } from "@/lib/notifications/task-series-db";
import type { TaskNotificationSettings } from "@/lib/notifications/types";
import { tickTaskRecurrence } from "@/lib/retail-tasks/task-recurrence";
import { isTaskOverdue } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const ACTIVE_STATUSES: TaskStatus[] = ["pending", "in_progress", "rejected"];
const OVERDUE_REMINDER_STATUSES: TaskStatus[] = ["pending", "in_progress", "rejected"];

type TaskRow = {
  id: string;
  company_id: string;
  shop_id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  status: TaskStatus;
  assigned_staff_id: string | null;
  series_id: string | null;
  created_at: string;
};

function taskDueAtIso(dueDate: string, dueTime: string | null): Date {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  return new Date(`${dueDate}T${timePart}:00+08:00`);
}

function formatDueLabel(dueDate: string, dueTime: string | null): string {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  return `${dueDate} ${timePart}`;
}

async function notifyForTask(
  supabase: Supabase,
  task: TaskRow,
  type: "task_assigned" | "task_due_soon" | "task_overdue",
  fire_key: string,
  title: string,
  message: string,
): Promise<void> {
  const settings = await loadTaskSeriesNotificationSettings(supabase, task.series_id);

  if (type === "task_assigned") {
    await notifyTaskAssigned(supabase, task, settings);
    return;
  }

  const recipients = await resolveTaskNotificationRecipients(supabase, {
    company_id: task.company_id,
    shop_id: task.shop_id,
    assigned_staff_id: task.assigned_staff_id,
    settings,
  });
  if (recipients.length === 0) return;

  await dispatchToMany(supabase, recipients, {
    company_id: task.company_id,
    shop_id: task.shop_id,
    type,
    title,
    message,
    related_task_id: task.id,
    fire_key,
    link_path: `/employee/tasks?shop_id=${encodeURIComponent(task.shop_id)}`,
  });
}

export async function runTaskReminderEngine(
  supabase: Supabase,
  companyId: string,
  now = new Date(),
): Promise<{ assigned: number; reminders: number; overdue: number }> {
  await tickTaskRecurrence(supabase, companyId);

  const stats = { assigned: 0, reminders: 0, overdue: 0 };
  const windowStart = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const cronEnd = new Date(now.getTime() + 5 * 60 * 1000);

  const { data: tasks, error } = await supabase
    .from("retail_tasks")
    .select(
      "id, company_id, shop_id, title, due_date, due_time, status, assigned_staff_id, series_id, created_at",
    )
    .eq("company_id", companyId)
    .in("status", ACTIVE_STATUSES);
  if (error) throw new Error(error.message);

  for (const raw of tasks ?? []) {
    const task = raw as TaskRow;
    const dueAt = taskDueAtIso(task.due_date, task.due_time);
    const settings = await loadTaskSeriesNotificationSettings(supabase, task.series_id);

    if (task.created_at >= windowStart) {
      await notifyTaskAssigned(supabase, task, settings);
      stats.assigned++;
    }

    if (settings.reminder_offset_minutes) {
      const reminderAt = new Date(dueAt.getTime() - settings.reminder_offset_minutes * 60_000);
      if (reminderAt <= now && reminderAt > new Date(now.getTime() - 5 * 60_000)) {
        await notifyForTask(
          supabase,
          task,
          "task_due_soon",
          `reminder:${settings.reminder_offset_minutes}`,
          "Task due soon",
          `${task.title} is due at ${formatDueLabel(task.due_date, task.due_time)}`,
        );
        stats.reminders++;
      }
    }

    if (
      OVERDUE_REMINDER_STATUSES.includes(task.status) &&
      isTaskOverdue(task.due_date, task.due_time, task.status, now) &&
      dueAt < cronEnd
    ) {
      await notifyForTask(
        supabase,
        task,
        "task_overdue",
        "overdue:1",
        "Task overdue",
        `${task.title} was due ${formatDueLabel(task.due_date, task.due_time)} and is not completed.`,
      );
      stats.overdue++;
    }
  }

  return stats;
}

export async function runTaskReminderEngineForAllCompanies(
  supabase: Supabase,
): Promise<void> {
  const { data, error } = await supabase.from("companies").select("id");
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    try {
      await runTaskReminderEngine(supabase, String(row.id));
    } catch (e) {
      console.warn("[task-reminder-engine] company tick failed", row.id, e);
    }
  }
}

export async function notifyScheduleUpdated(
  supabase: Supabase,
  params: {
    company_id: string;
    staff_id: string;
    shop_id: string;
    schedule_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
  },
): Promise<void> {
  const { dispatchNotification } = await import("@/lib/notifications/notification-service");
  await dispatchNotification(supabase, {
    company_id: params.company_id,
    staff_id: params.staff_id,
    shop_id: params.shop_id,
    type: "schedule_updated",
    title: "Schedule updated",
    message: `Your shift on ${params.shift_date} is now ${params.start_time}–${params.end_time}.`,
    related_schedule_id: params.schedule_id,
    fire_key: `schedule:${params.schedule_id}:${params.start_time}:${params.end_time}`,
    link_path: "/employee/attendance",
  });
}
