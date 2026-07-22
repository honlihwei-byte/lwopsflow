import { notifyTaskAssignedBatch } from "@/lib/notifications/task-assigned-notify";
import type { TaskNotificationSettings } from "@/lib/notifications/types";
import { findDuplicateShopsForTask } from "@/lib/retail-tasks/task-duplicate-guard";
import {
  createRecurringRetailTasks,
  type RetailTaskCreateInput,
} from "@/lib/retail-tasks/task-recurrence";
import type { RetailTaskRow } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type ShopTaskAssignment = {
  assigned_staff_id?: string | null;
  verifier_staff_id?: string | null;
};

export type MultiShopTaskCreateResult = {
  tasks: RetailTaskRow[];
  created_by_shop: Array<{
    shop_id: string;
    shop_name: string;
    instances_created: number;
    series_id: string | null;
  }>;
  skipped_duplicates: Array<{ shop_id: string; shop_name: string }>;
  total_instances_created: number;
};

export async function createRetailTasksForShops(
  supabase: Supabase,
  params: {
    shop_ids: string[];
    shopNames: Map<string, string>;
    template: Omit<RetailTaskCreateInput, "shop_id" | "assigned_staff_id" | "verifier_staff_id">;
    shop_assignments?: Record<string, ShopTaskAssignment>;
    default_assignment?: ShopTaskAssignment;
    actor: { name: string; role: string };
    notification: TaskNotificationSettings;
    skip_duplicates?: boolean;
  },
): Promise<MultiShopTaskCreateResult> {
  const skipDuplicates = params.skip_duplicates !== false;
  const uniqueShopIds = [...new Set(params.shop_ids.filter(Boolean))];
  if (uniqueShopIds.length === 0) {
    throw new Error("At least one shop is required");
  }

  let shopIdsToCreate = uniqueShopIds;
  let skipped_duplicates: Array<{ shop_id: string; shop_name: string }> = [];

  if (skipDuplicates) {
    skipped_duplicates = await findDuplicateShopsForTask(supabase, {
      company_id: params.template.company_id,
      shop_ids: uniqueShopIds,
      title: params.template.title,
      due_date: params.template.due_date,
      shopNames: params.shopNames,
    });
    const skipSet = new Set(skipped_duplicates.map((d) => d.shop_id));
    shopIdsToCreate = uniqueShopIds.filter((id) => !skipSet.has(id));
  }

  const allTasks: RetailTaskRow[] = [];
  const created_by_shop: MultiShopTaskCreateResult["created_by_shop"] = [];

  for (const shop_id of shopIdsToCreate) {
    const assignment = params.shop_assignments?.[shop_id] ?? params.default_assignment ?? {};
    const tasks = await createRecurringRetailTasks(
      supabase,
      {
        ...params.template,
        shop_id,
        assigned_staff_id: assignment.assigned_staff_id ?? null,
        verifier_staff_id: assignment.verifier_staff_id ?? null,
      },
      params.actor,
      params.notification,
    );
    allTasks.push(...tasks);
    created_by_shop.push({
      shop_id,
      shop_name: params.shopNames.get(shop_id) ?? shop_id,
      instances_created: tasks.length,
      series_id: tasks[0]?.series_id ?? null,
    });
  }

  if (allTasks.length > 0) {
    void notifyTaskAssignedBatch(supabase, allTasks, params.notification).catch((e) => {
      console.warn("[retail-tasks] multi-shop assignment notification failed", e);
    });
  }

  return {
    tasks: allTasks,
    created_by_shop,
    skipped_duplicates,
    total_instances_created: allTasks.length,
  };
}
