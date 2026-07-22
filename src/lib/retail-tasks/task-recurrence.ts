import { addDaysYmd } from "@/lib/attendance";
import { notifyTaskAssigned } from "@/lib/notifications/task-assigned-notify";
import {
  createTaskSeries,
  loadCancelledSeriesIds,
  loadSeriesExclusionsByCompany,
  loadTaskSeriesNotificationSettings,
} from "@/lib/notifications/task-series-db";
import {
  DEFAULT_TASK_NOTIFICATION_SETTINGS,
  type TaskNotificationSettings,
} from "@/lib/notifications/types";
import { logTaskActivity } from "@/lib/retail-tasks/task-activity";
import { todayYmd } from "@/lib/retail-tasks/task-status";
import { taskMissedCutoffYmd } from "@/lib/retail-tasks/task-overdue";
import type { RetailTaskRow, TaskRepeatType } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const TASK_INSERT_SELECT =
  "id, company_id, shop_id, assigned_staff_id, verifier_staff_id, title, description, category, priority, status, due_date, due_time, repeat_type, series_id, materialized_by, photo_required, min_photos, photo_capture_mode, checklist_items, gps_required, feedback_allowed, created_by, started_at, started_by, created_at, updated_at";

export const RECURRENCE_HORIZON = {
  daily: 14,
  weekly: 8,
  monthly: 6,
} as const;

const MISSED_STATUSES = ["pending", "in_progress", "rejected", "submitted"] as const;
const RECURRENCE_TICK_TTL_MS = 60_000;
const recurrenceTickCache = new Map<string, number>();

function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function taskOccurrenceDate(
  anchorYmd: string,
  repeatType: TaskRepeatType,
  index: number,
): string {
  if (repeatType === "one_time") return anchorYmd;
  if (repeatType === "daily") return addDaysYmd(anchorYmd, index);
  if (repeatType === "weekly") return addDaysYmd(anchorYmd, 7 * index);
  return addMonthsYmd(anchorYmd, index);
}

export function initialOccurrenceCount(repeatType: TaskRepeatType): number {
  switch (repeatType) {
    case "daily":
      return RECURRENCE_HORIZON.daily;
    case "weekly":
      return RECURRENCE_HORIZON.weekly;
    case "monthly":
      return RECURRENCE_HORIZON.monthly;
    default:
      return 1;
  }
}

function recurrenceHorizonEnd(fromYmd: string, repeatType: TaskRepeatType): string {
  switch (repeatType) {
    case "daily":
      return addDaysYmd(fromYmd, RECURRENCE_HORIZON.daily);
    case "weekly":
      return addDaysYmd(fromYmd, 7 * RECURRENCE_HORIZON.weekly);
    case "monthly":
      return addMonthsYmd(fromYmd, RECURRENCE_HORIZON.monthly);
    default:
      return fromYmd;
  }
}

export function occurrenceDatesThroughHorizon(
  anchorYmd: string,
  repeatType: TaskRepeatType,
  endYmd: string,
): string[] {
  if (repeatType === "one_time") return [anchorYmd];
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    const d = taskOccurrenceDate(anchorYmd, repeatType, i);
    if (d > endYmd) break;
    out.push(d);
  }
  return out;
}

export type RetailTaskCreateInput = Omit<
  RetailTaskRow,
  "id" | "created_at" | "updated_at" | "started_at" | "started_by" | "series_id" | "materialized_by"
>;

function normalizeInsertedTask(row: Record<string, unknown>): RetailTaskRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    shop_id: String(row.shop_id),
    assigned_staff_id: row.assigned_staff_id != null ? String(row.assigned_staff_id) : null,
    verifier_staff_id: row.verifier_staff_id != null ? String(row.verifier_staff_id) : null,
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : null,
    category: row.category as RetailTaskRow["category"],
    priority: (row.priority ?? "normal") as RetailTaskRow["priority"],
    status: (row.status ?? "pending") as RetailTaskRow["status"],
    due_date: String(row.due_date),
    due_time: row.due_time != null ? String(row.due_time).slice(0, 5) : null,
    repeat_type: (row.repeat_type ?? "one_time") as TaskRepeatType,
    series_id: row.series_id != null ? String(row.series_id) : null,
    materialized_by:
      String(row.materialized_by ?? "initial") === "scheduler" ? "scheduler" : "initial",
    photo_required: row.photo_required === true,
    min_photos: Number(row.min_photos ?? 0),
    photo_capture_mode:
      String(row.photo_capture_mode ?? "camera_only") === "camera_or_gallery"
        ? "camera_or_gallery"
        : "camera_only",
    checklist_items: Array.isArray(row.checklist_items) ? (row.checklist_items as RetailTaskRow["checklist_items"]) : [],
    gps_required: row.gps_required === true,
    feedback_allowed: row.feedback_allowed !== false,
    created_by: row.created_by != null ? String(row.created_by) : null,
    started_at: null,
    started_by: null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function insertTaskInstances(
  supabase: Supabase,
  template: RetailTaskCreateInput,
  dueDates: string[],
  seriesId: string | null,
  actor: { name: string; role: string },
  materializedBy: "initial" | "scheduler" = "initial",
): Promise<RetailTaskRow[]> {
  if (dueDates.length === 0) return [];

  const now = new Date().toISOString();
  const rows = dueDates.map((due_date) => ({
    company_id: template.company_id,
    shop_id: template.shop_id,
    assigned_staff_id: template.assigned_staff_id,
    verifier_staff_id: template.verifier_staff_id,
    title: template.title,
    description: template.description,
    category: template.category,
    priority: template.priority,
    status: "pending",
    due_date,
    due_time: template.due_time,
    repeat_type: template.repeat_type,
    series_id: seriesId,
    materialized_by: materializedBy,
    photo_required: template.photo_required,
    min_photos: template.min_photos,
    photo_capture_mode: template.photo_capture_mode,
    checklist_items: template.checklist_items,
    gps_required: template.gps_required,
    feedback_allowed: template.feedback_allowed,
    created_by: template.created_by,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("retail_tasks")
    .insert(rows)
    .select(TASK_INSERT_SELECT);
  if (error) throw new Error(error.message);

  const tasks = (data ?? []).map((r) => normalizeInsertedTask(r as Record<string, unknown>));
  for (const task of tasks) {
    await logTaskActivity(supabase, {
      task_id: task.id,
      actor_name: actor.name,
      actor_role: actor.role,
      action_type: "created",
      new_status: task.status,
      note: task.title,
    });
  }
  return tasks;
}

/** Materialize one or more occurrence rows for a new task definition. */
export async function createRecurringRetailTasks(
  supabase: Supabase,
  template: RetailTaskCreateInput,
  actor: { name: string; role: string },
  notification: TaskNotificationSettings = DEFAULT_TASK_NOTIFICATION_SETTINGS,
): Promise<RetailTaskRow[]> {
  const seriesId = await createTaskSeries(supabase, {
    company_id: template.company_id,
    shop_id: template.shop_id,
    title: template.title,
    repeat_type: template.repeat_type,
    anchor_due_date: template.due_date,
    due_time: template.due_time,
    notification,
  });

  if (template.repeat_type === "one_time") {
    const [task] = await insertTaskInstances(supabase, template, [template.due_date], seriesId, actor);
    return task ? [task] : [];
  }

  const count = initialOccurrenceCount(template.repeat_type);
  const dueDates = Array.from({ length: count }, (_, i) =>
    taskOccurrenceDate(template.due_date, template.repeat_type, i),
  );
  return insertTaskInstances(supabase, template, dueDates, seriesId, actor);
}

export async function markMissedPastDueTasks(
  supabase: Supabase,
  companyId: string,
): Promise<number> {
  const today = todayYmd();
  const missedCutoff = taskMissedCutoffYmd(today);
  const { data, error } = await supabase
    .from("retail_tasks")
    .select("id, status")
    .eq("company_id", companyId)
    .lt("due_date", missedCutoff)
    .in("status", [...MISSED_STATUSES]);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  for (const row of rows) {
    const id = String(row.id);
    const oldStatus = String(row.status);
    const { error: updErr } = await supabase
      .from("retail_tasks")
      .update({ status: "missed", updated_at: now })
      .eq("id", id)
      .eq("status", oldStatus);
    if (updErr) continue;

    await logTaskActivity(supabase, {
      task_id: id,
      actor_name: "System",
      actor_role: "system",
      action_type: "status_changed",
      old_status: oldStatus,
      new_status: "missed",
      note: "Past due without completion",
    });
  }

  return rows.length;
}

export async function extendRecurringTaskInstances(
  supabase: Supabase,
  companyId: string,
): Promise<number> {
  const today = todayYmd();
  const [cancelledSeries, exclusionsBySeries] = await Promise.all([
    loadCancelledSeriesIds(supabase, companyId),
    loadSeriesExclusionsByCompany(supabase, companyId),
  ]);

  const { data, error } = await supabase
    .from("retail_tasks")
    .select(
      "id, series_id, repeat_type, due_date, company_id, shop_id, assigned_staff_id, verifier_staff_id, title, description, category, priority, due_time, photo_required, min_photos, photo_capture_mode, checklist_items, gps_required, feedback_allowed, created_by",
    )
    .eq("company_id", companyId)
    .not("series_id", "is", null)
    .neq("repeat_type", "one_time");
  if (error) throw new Error(error.message);

  const bySeries = new Map<string, Array<Record<string, unknown>>>();
  for (const row of data ?? []) {
    const sid = String(row.series_id);
    if (cancelledSeries.has(sid)) continue;
    const list = bySeries.get(sid) ?? [];
    list.push(row as Record<string, unknown>);
    bySeries.set(sid, list);
  }

  let created = 0;
  for (const [seriesId, instances] of bySeries.entries()) {
    const repeatType = String(instances[0]!.repeat_type) as TaskRepeatType;
    if (repeatType === "one_time") continue;

    const anchor = instances.reduce(
      (min, r) => (String(r.due_date) < min ? String(r.due_date) : min),
      String(instances[0]!.due_date),
    );
    const existing = new Set(instances.map((r) => String(r.due_date)));
    const excluded = exclusionsBySeries.get(seriesId) ?? new Set<string>();
    const templateRow = instances.find((r) => String(r.due_date) === anchor) ?? instances[0]!;
    const horizonEnd = recurrenceHorizonEnd(today, repeatType);
    const candidateDates = occurrenceDatesThroughHorizon(anchor, repeatType, horizonEnd).filter(
      (d) => d >= today && !existing.has(d) && !excluded.has(d),
    );
    if (candidateDates.length === 0) continue;

    const template: RetailTaskCreateInput = {
      company_id: String(templateRow.company_id),
      shop_id: String(templateRow.shop_id),
      assigned_staff_id:
        templateRow.assigned_staff_id != null ? String(templateRow.assigned_staff_id) : null,
      verifier_staff_id:
        templateRow.verifier_staff_id != null ? String(templateRow.verifier_staff_id) : null,
      title: String(templateRow.title ?? ""),
      description: templateRow.description != null ? String(templateRow.description) : null,
      category: templateRow.category as RetailTaskCreateInput["category"],
      priority: (templateRow.priority ?? "normal") as RetailTaskCreateInput["priority"],
      status: "pending",
      due_date: anchor,
      due_time: templateRow.due_time != null ? String(templateRow.due_time).slice(0, 5) : null,
      repeat_type: repeatType,
      photo_required: templateRow.photo_required === true,
      min_photos: Number(templateRow.min_photos ?? 0),
      photo_capture_mode:
        String(templateRow.photo_capture_mode ?? "camera_only") === "camera_or_gallery"
          ? "camera_or_gallery"
          : "camera_only",
      checklist_items: Array.isArray(templateRow.checklist_items)
        ? (templateRow.checklist_items as RetailTaskCreateInput["checklist_items"])
        : [],
      gps_required: templateRow.gps_required === true,
      feedback_allowed: templateRow.feedback_allowed !== false,
      created_by: templateRow.created_by != null ? String(templateRow.created_by) : null,
    };

    const inserted = await insertTaskInstances(
      supabase,
      template,
      candidateDates,
      seriesId,
      { name: "System", role: "system" },
      "scheduler",
    );
    created += inserted.length;

    if (inserted.length > 0) {
      const settings = await loadTaskSeriesNotificationSettings(supabase, seriesId);
      for (const task of inserted) {
        void notifyTaskAssigned(supabase, task, settings).catch((e) => {
          console.warn("[task-recurrence] instance notification failed", task.id, e);
        });
      }
    }
  }

  return created;
}

/**
 * Recurrence tick — invoked by:
 * - GET /api/admin/retail-tasks (admin task list)
 * - GET /api/admin/retail-tasks/dashboard
 * - GET /api/employee/tasks
 * - GET /api/shops/[shopId]/retail-tasks
 * - Vercel cron 08:00 daily → /api/cron/task-notifications → runTaskReminderEngineForAllCompanies
 *
 * Skips cancelled series (retail_task_series.cancelled_at) and excluded dates
 * (retail_task_series_exclusions). Only extends the forward rolling window from today.
 */
export async function tickTaskRecurrence(supabase: Supabase, companyId: string): Promise<void> {
  const lastTick = recurrenceTickCache.get(companyId) ?? 0;
  const now = Date.now();
  if (now - lastTick < RECURRENCE_TICK_TTL_MS) return;
  recurrenceTickCache.set(companyId, now);

  await markMissedPastDueTasks(supabase, companyId);
  await extendRecurringTaskInstances(supabase, companyId);
}
