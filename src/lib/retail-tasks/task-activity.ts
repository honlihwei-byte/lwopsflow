import type { createAdminClient } from "@/lib/supabase/admin";
import type { TaskActionType, TaskStatus } from "@/lib/retail-tasks/types";

type Supabase = ReturnType<typeof createAdminClient>;

export async function logTaskActivity(
  supabase: Supabase,
  params: {
    task_id: string;
    actor_id?: string | null;
    actor_name: string;
    actor_role: string;
    action_type: TaskActionType;
    old_status?: TaskStatus | string | null;
    new_status?: TaskStatus | string | null;
    note?: string | null;
  },
): Promise<void> {
  // Activity logs are best-effort audit. A failed insert (e.g. the parent task
  // row was already removed) must never block the primary action — warn instead.
  try {
    const { error } = await supabase.from("retail_task_activity_logs").insert({
      task_id: params.task_id,
      actor_id: params.actor_id ?? null,
      actor_name: params.actor_name,
      actor_role: params.actor_role,
      action_type: params.action_type,
      old_status: params.old_status ?? null,
      new_status: params.new_status ?? null,
      note: params.note ?? null,
    });
    if (error) {
      console.warn("[task-activity] log insert failed (non-blocking):", error.message);
    }
  } catch (e) {
    console.warn("[task-activity] log insert threw (non-blocking):", e);
  }
}
