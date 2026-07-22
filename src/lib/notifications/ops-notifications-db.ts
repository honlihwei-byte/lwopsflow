import type { OpsNotificationType } from "@/lib/notifications/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type OpsNotificationRow = {
  id: string;
  company_id: string;
  staff_id: string;
  shop_id: string | null;
  type: OpsNotificationType;
  title: string;
  message: string | null;
  read_at: string | null;
  related_task_id: string | null;
  related_schedule_id: string | null;
  fire_key: string;
  link_path: string | null;
  created_at: string;
};

function normalize(row: Record<string, unknown>): OpsNotificationRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    staff_id: String(row.staff_id),
    shop_id: row.shop_id != null ? String(row.shop_id) : null,
    type: String(row.type) as OpsNotificationType,
    title: String(row.title),
    message: row.message != null ? String(row.message) : null,
    read_at: row.read_at != null ? String(row.read_at) : null,
    related_task_id: row.related_task_id != null ? String(row.related_task_id) : null,
    related_schedule_id:
      row.related_schedule_id != null ? String(row.related_schedule_id) : null,
    fire_key: String(row.fire_key ?? "default"),
    link_path: row.link_path != null ? String(row.link_path) : null,
    created_at: String(row.created_at),
  };
}

export async function insertOpsNotification(
  supabase: Supabase,
  params: {
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
  },
): Promise<OpsNotificationRow | null> {
  const { data, error } = await supabase
    .from("ops_notifications")
    .insert({
      company_id: params.company_id,
      staff_id: params.staff_id,
      shop_id: params.shop_id ?? null,
      type: params.type,
      title: params.title,
      message: params.message ?? null,
      related_task_id: params.related_task_id ?? null,
      related_schedule_id: params.related_schedule_id ?? null,
      fire_key: params.fire_key ?? "default",
      link_path: params.link_path ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return normalize(data as Record<string, unknown>);
}

export async function countUnreadForStaff(
  supabase: Supabase,
  staffId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("ops_notifications")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countUnreadForCompany(
  supabase: Supabase,
  companyId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("ops_notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listNotificationsForStaff(
  supabase: Supabase,
  staffId: string,
  limit = 50,
): Promise<OpsNotificationRow[]> {
  const { data, error } = await supabase
    .from("ops_notifications")
    .select(
      "id, company_id, staff_id, shop_id, type, title, message, read_at, related_task_id, related_schedule_id, fire_key, link_path, created_at",
    )
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export type AdminNotificationRow = OpsNotificationRow & {
  staff_name: string;
  shop_name: string | null;
};

export async function listNotificationsForCompany(
  supabase: Supabase,
  companyId: string,
  params?: { limit?: number; shop_id?: string },
): Promise<AdminNotificationRow[]> {
  let q = supabase
    .from("ops_notifications")
    .select(
      "id, company_id, staff_id, shop_id, type, title, message, read_at, related_task_id, related_schedule_id, fire_key, link_path, created_at, staff:staff_id(staff_name), shop:shop_id(name)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 100);
  if (params?.shop_id) q = q.eq("shop_id", params.shop_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((raw) => {
    const row = normalize(raw as Record<string, unknown>);
    const staff = (raw as { staff?: { staff_name?: string } }).staff;
    const shop = (raw as { shop?: { name?: string } }).shop;
    return {
      ...row,
      staff_name: String(staff?.staff_name ?? "—"),
      shop_name: shop?.name != null ? String(shop.name) : null,
    };
  });
}

export async function markNotificationRead(
  supabase: Supabase,
  staffId: string,
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ops_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(
  supabase: Supabase,
  staffId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ops_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("staff_id", staffId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function getStaffNotificationPreferences(
  supabase: Supabase,
  staffId: string,
  companyId: string,
): Promise<{ notifications_enabled: boolean; push_enabled: boolean }> {
  const { data } = await supabase
    .from("staff_notification_preferences")
    .select("notifications_enabled, push_enabled")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!data) {
    return { notifications_enabled: true, push_enabled: false };
  }
  return {
    notifications_enabled: data.notifications_enabled !== false,
    push_enabled: data.push_enabled === true,
  };
}

export async function upsertStaffNotificationPreferences(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    notifications_enabled?: boolean;
    push_enabled?: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("staff_notification_preferences").upsert(
    {
      staff_id: params.staff_id,
      company_id: params.company_id,
      notifications_enabled: params.notifications_enabled ?? true,
      push_enabled: params.push_enabled ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id" },
  );
  if (error) throw new Error(error.message);
}

export async function savePushSubscription(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("staff_push_subscriptions").upsert(
    {
      staff_id: params.staff_id,
      company_id: params.company_id,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      user_agent: params.user_agent ?? null,
    },
    { onConflict: "staff_id,endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function deletePushSubscription(
  supabase: Supabase,
  staffId: string,
  endpoint: string,
): Promise<void> {
  const { error } = await supabase
    .from("staff_push_subscriptions")
    .delete()
    .eq("staff_id", staffId)
    .eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export async function listPushSubscriptionsForStaff(
  supabase: Supabase,
  staffId: string,
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  const { data, error } = await supabase
    .from("staff_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    endpoint: String(r.endpoint),
    p256dh: String(r.p256dh),
    auth: String(r.auth),
  }));
}
