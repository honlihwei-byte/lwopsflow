import {
  getStaffNotificationPreferences,
  insertOpsNotification,
} from "@/lib/notifications/ops-notifications-db";
import {
  PUSH_ELIGIBLE_TYPES,
  type OpsNotificationType,
} from "@/lib/notifications/types";
import { sendBrowserPushToStaff } from "@/lib/notifications/web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type DispatchNotificationParams = {
  company_id: string;
  staff_id: string;
  shop_id?: string | null;
  type: OpsNotificationType;
  title: string;
  message?: string | null;
  related_task_id?: string | null;
  related_schedule_id?: string | null;
  fire_key?: string;
  link_path?: string | null;
};

/** Create in-app notification and optionally browser push. Never throws. */
export async function dispatchNotification(
  supabase: Supabase,
  params: DispatchNotificationParams,
): Promise<string | null> {
  try {
    const prefs = await getStaffNotificationPreferences(
      supabase,
      params.staff_id,
      params.company_id,
    );
    if (!prefs.notifications_enabled) return null;

    const row = await insertOpsNotification(supabase, params);
    if (!row) return null;

    if (
      prefs.push_enabled &&
      PUSH_ELIGIBLE_TYPES.includes(params.type) &&
      process.env.VAPID_PUBLIC_KEY
    ) {
      await sendBrowserPushToStaff(supabase, {
        staff_id: params.staff_id,
        title: params.title,
        body: params.message ?? params.title,
        url: params.link_path ?? undefined,
      }).catch(() => {});
    }

    return row.id;
  } catch (e) {
    console.warn("[notification-service] dispatch failed", e);
    return null;
  }
}

export async function dispatchToMany(
  supabase: Supabase,
  staffIds: string[],
  base: Omit<DispatchNotificationParams, "staff_id">,
): Promise<void> {
  for (const staff_id of staffIds) {
    await dispatchNotification(supabase, { ...base, staff_id });
  }
}
