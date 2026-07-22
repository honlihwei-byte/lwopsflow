import { dispatchNotification } from "@/lib/notifications/notification-service";
import type { OpsNotificationType } from "@/lib/notifications/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type EmployeeNotificationType =
  | "task_assigned"
  | "task_due_soon"
  | "task_rejected"
  | "schedule_changed"
  | "missing_clock_out";

const TYPE_MAP: Record<EmployeeNotificationType, OpsNotificationType> = {
  task_assigned: "task_assigned",
  task_due_soon: "task_due_soon",
  task_rejected: "task_rejected",
  schedule_changed: "schedule_updated",
  missing_clock_out: "attendance_exception",
};

/** @deprecated Prefer dispatchNotification from notification-service. */
export async function createEmployeeNotification(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    type: EmployeeNotificationType;
    title: string;
    body?: string;
    link_path?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const id = await dispatchNotification(supabase, {
    company_id: params.company_id,
    staff_id: params.staff_id,
    type: TYPE_MAP[params.type] ?? "task_assigned",
    title: params.title,
    message: params.body ?? null,
    link_path: params.link_path ?? null,
    fire_key: params.type,
  });
  return id ?? "";
}

export {
  countUnreadForStaff as countUnreadNotifications,
  listNotificationsForStaff as listEmployeeNotifications,
  markNotificationRead,
} from "@/lib/notifications/ops-notifications-db";
