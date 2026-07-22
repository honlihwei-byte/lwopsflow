import {
  DEFAULT_TASK_NOTIFICATION_SETTINGS,
  type TaskNotificationSettings,
} from "@/lib/notifications/types";
import type { TaskRepeatType } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type TaskSeriesRow = {
  id: string;
  company_id: string;
  shop_id: string;
  title: string;
  repeat_type: TaskRepeatType;
  anchor_due_date: string;
  due_time: string | null;
  notify_assigned_staff: boolean;
  notify_supervisor: boolean;
  notify_store_manager: boolean;
  reminder_offset_minutes: number | null;
  cancelled_at: string | null;
};

export async function createTaskSeries(
  supabase: Supabase,
  params: {
    company_id: string;
    shop_id: string;
    title: string;
    repeat_type: TaskRepeatType;
    anchor_due_date: string;
    due_time: string | null;
    notification: TaskNotificationSettings;
  },
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("retail_task_series")
    .insert({
      company_id: params.company_id,
      shop_id: params.shop_id,
      title: params.title,
      repeat_type: params.repeat_type,
      anchor_due_date: params.anchor_due_date,
      due_time: params.due_time,
      notify_assigned_staff: params.notification.notify_assigned_staff,
      notify_supervisor: params.notification.notify_supervisor,
      notify_store_manager: params.notification.notify_store_manager,
      reminder_offset_minutes: params.notification.reminder_offset_minutes,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create task series");
  return String(data.id);
}

export async function loadTaskSeriesNotificationSettings(
  supabase: Supabase,
  seriesId: string | null,
): Promise<TaskNotificationSettings> {
  if (!seriesId) return DEFAULT_TASK_NOTIFICATION_SETTINGS;
  const { data } = await supabase
    .from("retail_task_series")
    .select(
      "notify_assigned_staff, notify_supervisor, notify_store_manager, reminder_offset_minutes",
    )
    .eq("id", seriesId)
    .maybeSingle();
  if (!data) return DEFAULT_TASK_NOTIFICATION_SETTINGS;
  return {
    notify_assigned_staff: data.notify_assigned_staff !== false,
    notify_supervisor: data.notify_supervisor === true,
    notify_store_manager: data.notify_store_manager === true,
    reminder_offset_minutes:
      data.reminder_offset_minutes != null ? Number(data.reminder_offset_minutes) : null,
  };
}

export async function cancelTaskSeries(supabase: Supabase, seriesId: string): Promise<void> {
  const { error } = await supabase
    .from("retail_task_series")
    .update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", seriesId)
    .is("cancelled_at", null);
  if (error) throw new Error(error.message);
}

export async function addSeriesOccurrenceExclusion(
  supabase: Supabase,
  params: {
    series_id: string;
    company_id: string;
    shop_id: string;
    due_date: string;
  },
): Promise<void> {
  const { error } = await supabase.from("retail_task_series_exclusions").upsert(
    {
      series_id: params.series_id,
      company_id: params.company_id,
      shop_id: params.shop_id,
      due_date: params.due_date,
    },
    { onConflict: "series_id,due_date", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function loadCancelledSeriesIds(
  supabase: Supabase,
  companyId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("retail_task_series")
    .select("id")
    .eq("company_id", companyId)
    .not("cancelled_at", "is", null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => String(row.id)));
}

export async function loadSeriesExclusionsByCompany(
  supabase: Supabase,
  companyId: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase
    .from("retail_task_series_exclusions")
    .select("series_id, due_date")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const sid = String(row.series_id);
    const set = map.get(sid) ?? new Set<string>();
    set.add(String(row.due_date));
    map.set(sid, set);
  }
  return map;
}
