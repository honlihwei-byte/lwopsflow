import { fetchAttendanceForDay } from "@/lib/attendance-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { TaskNotificationSettings } from "@/lib/notifications/types";
import { listActiveStaffForShop } from "@/lib/staff";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

async function listOnDutyStaffForShop(
  supabase: Supabase,
  shopId: string,
  dayYmd = malaysiaDateYmd(new Date()),
): Promise<string[]> {
  const rows = await fetchAttendanceForDay(supabase, dayYmd, shopId);
  const byStaff = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byStaff.get(row.staff_id) ?? [];
    list.push(row);
    byStaff.set(row.staff_id, list);
  }

  const onDuty: string[] = [];
  for (const [staffId, staffRows] of byStaff) {
    const sorted = [...staffRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const last = sorted[sorted.length - 1];
    if (last?.action_type === "clock_in") onDuty.push(staffId);
  }
  return onDuty;
}

async function listShopAssignedStaffIds(supabase: Supabase, shopId: string): Promise<string[]> {
  const staff = await listActiveStaffForShop(supabase, shopId);
  return staff.map((s) => s.id);
}

export async function resolveTaskNotificationRecipients(
  supabase: Supabase,
  params: {
    company_id: string;
    shop_id: string;
    assigned_staff_id: string | null;
    settings: TaskNotificationSettings;
  },
): Promise<string[]> {
  const ids = new Set<string>();

  if (params.settings.notify_assigned_staff) {
    if (params.assigned_staff_id) {
      ids.add(params.assigned_staff_id);
    } else {
      const onDuty = await listOnDutyStaffForShop(supabase, params.shop_id);
      if (onDuty.length > 0) {
        for (const id of onDuty) ids.add(id);
      } else {
        const assigned = await listShopAssignedStaffIds(supabase, params.shop_id);
        for (const id of assigned) ids.add(id);
      }
    }
  }

  if (params.settings.notify_supervisor) {
    const supervisors = await listSupervisorsForShop(supabase, params.company_id, params.shop_id);
    for (const id of supervisors) ids.add(id);
  }

  if (params.settings.notify_store_manager) {
    const managers = await listStoreManagersForShop(supabase, params.shop_id);
    for (const id of managers) ids.add(id);
  }

  return [...ids];
}

async function listSupervisorsForShop(
  supabase: Supabase,
  companyId: string,
  shopId: string,
): Promise<string[]> {
  const out = new Set<string>();

  const { data: roles } = await supabase
    .from("staff_task_roles")
    .select("staff_id")
    .eq("company_id", companyId)
    .eq("role", "supervisor");
  for (const r of roles ?? []) out.add(String(r.staff_id));

  const { data: profiles } = await supabase
    .from("staff_permission_profiles")
    .select("staff_id, role_template")
    .eq("company_id", companyId)
    .eq("role_template", "supervisor");
  for (const p of profiles ?? []) out.add(String(p.staff_id));

  return filterStaffWithShopAccess(supabase, [...out], shopId);
}

async function listStoreManagersForShop(
  supabase: Supabase,
  shopId: string,
): Promise<string[]> {
  const out = new Set<string>();

  const { data: mgrShops } = await supabase
    .from("staff_task_manager_shops")
    .select("staff_id")
    .eq("shop_id", shopId);
  for (const r of mgrShops ?? []) out.add(String(r.staff_id));

  const { data: shop } = await supabase
    .from("shops")
    .select("company_id")
    .eq("id", shopId)
    .maybeSingle();
  if (shop?.company_id) {
    const { data: profiles } = await supabase
      .from("staff_permission_profiles")
      .select("staff_id")
      .eq("company_id", String(shop.company_id))
      .eq("role_template", "store_manager");
    for (const p of profiles ?? []) out.add(String(p.staff_id));
  }

  return filterStaffWithShopAccess(supabase, [...out], shopId);
}

async function filterStaffWithShopAccess(
  supabase: Supabase,
  staffIds: string[],
  shopId: string,
): Promise<string[]> {
  if (staffIds.length === 0) return [];

  const { data: assigned } = await supabase
    .from("staff_shop_assignments")
    .select("staff_id")
    .eq("shop_id", shopId)
    .in("staff_id", staffIds);
  const assignedSet = new Set((assigned ?? []).map((r) => String(r.staff_id)));

  const { data: permShops } = await supabase
    .from("staff_permission_shops")
    .select("staff_id")
    .eq("shop_id", shopId)
    .in("staff_id", staffIds);
  for (const r of permShops ?? []) assignedSet.add(String(r.staff_id));

  return staffIds.filter((id) => assignedSet.has(id));
}
