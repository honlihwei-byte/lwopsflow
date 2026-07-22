import { logTaskActivity } from "@/lib/retail-tasks/task-activity";
import {
  addSeriesOccurrenceExclusion,
  cancelTaskSeries,
} from "@/lib/notifications/task-series-db";
import type { TaskDeleteScope } from "@/lib/retail-tasks/task-kind";
import { getRetailTaskById } from "@/lib/retail-tasks/retail-tasks-db";
import { isRecurringTask } from "@/lib/retail-tasks/task-kind";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

async function hardDeleteTaskRow(
  supabase: Supabase,
  taskId: string,
  actor: { name: string; role: string },
  note: string,
  oldStatus: string,
): Promise<void> {
  await logTaskActivity(supabase, {
    task_id: taskId,
    actor_name: actor.name,
    actor_role: actor.role,
    action_type: "deleted",
    old_status: oldStatus,
    note,
  });

  const { error } = await supabase.from("retail_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

/**
 * Delete a task occurrence, optionally cancelling future series instances.
 * Records series exclusions so tickTaskRecurrence does not recreate deleted dates.
 */
export async function deleteRetailTaskWithScope(
  supabase: Supabase,
  taskId: string,
  scope: TaskDeleteScope,
  actor: { name: string; role: string },
): Promise<{ deleted_count: number }> {
  const existing = await getRetailTaskById(supabase, taskId);
  if (!existing) throw new Error("Task not found");

  const recurring = isRecurringTask(existing);

  if (!recurring || scope === "occurrence") {
    if (existing.series_id) {
      await addSeriesOccurrenceExclusion(supabase, {
        series_id: existing.series_id,
        company_id: existing.company_id,
        shop_id: existing.shop_id,
        due_date: existing.due_date,
      });
    }
    await hardDeleteTaskRow(supabase, taskId, actor, existing.title, existing.status);
    return { deleted_count: 1 };
  }

  if (!existing.series_id) {
    await hardDeleteTaskRow(supabase, taskId, actor, existing.title, existing.status);
    return { deleted_count: 1 };
  }

  await cancelTaskSeries(supabase, existing.series_id);

  const { data: futureRows, error: listErr } = await supabase
    .from("retail_tasks")
    .select("id, status, title, due_date")
    .eq("series_id", existing.series_id)
    .gte("due_date", existing.due_date);
  if (listErr) throw new Error(listErr.message);

  let deleted_count = 0;
  for (const row of futureRows ?? []) {
    const id = String(row.id);
    await hardDeleteTaskRow(
      supabase,
      id,
      actor,
      String(row.title ?? existing.title),
      String(row.status),
    );
    deleted_count += 1;
  }

  return { deleted_count };
}
