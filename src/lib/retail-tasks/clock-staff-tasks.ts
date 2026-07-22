import { fetchAttendanceForDay } from "@/lib/attendance-db";
import { listRetailTasks } from "@/lib/retail-tasks/retail-tasks-db";
import { todayYmd } from "@/lib/retail-tasks/task-status";
import type { RetailTaskListItem } from "@/lib/retail-tasks/types";
import { listActiveStaffForShop } from "@/lib/staff";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

async function listOnDutyStaffIds(
  supabase: Supabase,
  shopId: string,
  dayYmd: string,
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

/** Tasks visible on QR clock for one staff member at one shop today. */
export async function listClockStaffTodayTasks(
  supabase: Supabase,
  params: {
    companyId: string;
    shopId: string;
    staffId: string;
    date?: string;
  },
): Promise<RetailTaskListItem[]> {
  const date = params.date ?? todayYmd();
  const rows = await listRetailTasks(supabase, {
    companyId: params.companyId,
    shopId: params.shopId,
    from: date,
    to: date,
  });

  const [onDuty, shopStaff] = await Promise.all([
    listOnDutyStaffIds(supabase, params.shopId, date),
    listActiveStaffForShop(supabase, params.shopId),
  ]);
  const shopStaffIds = new Set(shopStaff.map((s) => s.id));
  const isOnDuty = onDuty.includes(params.staffId);
  const showShopPool = isOnDuty || onDuty.length === 0;

  return rows.filter((task) => {
    if (task.assigned_staff_id === params.staffId) return true;
    if (!task.assigned_staff_id && showShopPool && shopStaffIds.has(params.staffId)) {
      return true;
    }
    return false;
  });
}
