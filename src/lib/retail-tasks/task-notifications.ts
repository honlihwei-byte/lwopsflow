import { dispatchNotification } from "@/lib/notifications/notification-service";
import type { OpsNotificationType } from "@/lib/notifications/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

/** @deprecated Use dispatchNotification directly. Kept for existing call sites. */
export async function notifyStaffTask(
  supabase: Supabase,
  params: {
    company_id: string;
    staff_id: string;
    shop_id: string;
    notification_type: string;
    title: string;
    body: string;
    task_id?: string;
    fire_key?: string;
    link_path?: string;
  },
): Promise<void> {
  const typeMap: Record<string, OpsNotificationType> = {
    task_assigned: "task_assigned",
    task_due_soon: "task_due_soon",
    task_rejected: "task_rejected",
    task_verified: "task_verified",
  };
  const type = typeMap[params.notification_type] ?? "task_assigned";

  await dispatchNotification(supabase, {
    company_id: params.company_id,
    staff_id: params.staff_id,
    shop_id: params.shop_id,
    type,
    title: params.title,
    message: params.body,
    related_task_id: params.task_id ?? null,
    fire_key: params.fire_key ?? params.notification_type,
    link_path:
      params.link_path ??
      `/employee/tasks?shop_id=${encodeURIComponent(params.shop_id)}`,
  });
}
