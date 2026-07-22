import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { dispatchNotification } from "@/lib/notifications/notification-service";
import { resolveTaskNotificationRecipients } from "@/lib/notifications/task-recipient-resolver";
import type { TaskNotificationSettings } from "@/lib/notifications/types";
import type { RetailTaskRow } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export const TASK_ASSIGNED_TITLE = "New Task Assigned";

export function taskAssignedFireKey(taskId: string, staffId: string): string {
  return `task_assigned:${taskId}:${staffId}`;
}

export function formatTaskDueLabel(dueDate: string, dueTime: string | null): string {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  return `${dueDate} ${timePart}`;
}

export function formatTaskAssignedMessage(
  taskTitle: string,
  shopName: string,
  dueDate: string,
  dueTime: string | null,
): string {
  return `${taskTitle} at ${shopName}, due ${formatTaskDueLabel(dueDate, dueTime)}`;
}

async function loadShopName(supabase: Supabase, shopId: string): Promise<string> {
  const { data } = await supabase.from("shops").select("name").eq("id", shopId).maybeSingle();
  return data?.name ? String(data.name) : "Shop";
}

/** Notify recipients for one task instance. Never throws. */
export async function notifyTaskAssigned(
  supabase: Supabase,
  task: Pick<
    RetailTaskRow,
    "id" | "company_id" | "shop_id" | "title" | "due_date" | "due_time" | "assigned_staff_id"
  >,
  settings: TaskNotificationSettings,
  shopName?: string,
): Promise<void> {
  try {
    const name = shopName ?? (await loadShopName(supabase, task.shop_id));
    const recipients = await resolveTaskNotificationRecipients(supabase, {
      company_id: task.company_id,
      shop_id: task.shop_id,
      assigned_staff_id: task.assigned_staff_id,
      settings,
    });
    if (recipients.length === 0) return;

    const message = formatTaskAssignedMessage(
      task.title,
      name,
      task.due_date,
      task.due_time,
    );
    const linkPath = `/employee/tasks?shop_id=${encodeURIComponent(task.shop_id)}`;

    for (const staff_id of recipients) {
      try {
        await dispatchNotification(supabase, {
          company_id: task.company_id,
          staff_id,
          shop_id: task.shop_id,
          type: "task_assigned",
          title: TASK_ASSIGNED_TITLE,
          message,
          related_task_id: task.id,
          fire_key: taskAssignedFireKey(task.id, staff_id),
          link_path: linkPath,
        });
      } catch (e) {
        console.warn("[task-assigned-notify] dispatch failed", task.id, staff_id, e);
      }
    }
  } catch (e) {
    console.warn("[task-assigned-notify] notify failed", task.id, e);
  }
}

/** Which newly created instances should notify immediately (avoid bulk future spam). */
export function tasksToNotifyOnCreate(tasks: RetailTaskRow[]): RetailTaskRow[] {
  if (tasks.length <= 1) return tasks;
  const today = malaysiaDateYmd(new Date());
  const dueToday = tasks.filter((t) => t.due_date === today);
  if (dueToday.length > 0) return dueToday;
  const sorted = [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date));
  return sorted[0] ? [sorted[0]] : [];
}

export async function notifyTaskAssignedBatch(
  supabase: Supabase,
  tasks: RetailTaskRow[],
  settings: TaskNotificationSettings,
): Promise<void> {
  const toNotify = tasksToNotifyOnCreate(tasks);
  if (toNotify.length === 0) return;

  let shopName: string | undefined;
  const shopId = toNotify[0]?.shop_id;
  if (shopId) {
    shopName = await loadShopName(supabase, shopId);
  }

  for (const task of toNotify) {
    await notifyTaskAssigned(supabase, task, settings, shopName);
  }
}
