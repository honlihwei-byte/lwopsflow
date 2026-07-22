import { logTaskActivity } from "@/lib/retail-tasks/task-activity";
import { normalizeChecklistItems } from "@/lib/retail-tasks/task-checklist";
import { normalizePhotoRecords, taskProofDisplayPath } from "@/lib/retail-tasks/task-proof-photos";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import { taskKind } from "@/lib/retail-tasks/task-kind";
import { staffTaskListFromYmd, WORKABLE_TASK_STATUSES } from "@/lib/retail-tasks/task-overdue";
import type { StaffConsistencyContext } from "@/lib/retail-tasks/task-scoring";
import type {
  RetailTaskActivityRow,
  RetailTaskFeedbackRow,
  RetailTaskListItem,
  TaskReviewSummary,
  TaskScoreBreakdown,
  RetailTaskRow,
  RetailTaskSubmissionRow,
  RetailTaskVerificationRow,
  TaskCategory,
  TaskPriority,
  TaskRepeatType,
  TaskStaffRole,
  TaskStatus,
  TaskProofPhotoRecord,
} from "@/lib/retail-tasks/types";
import { addDaysYmd } from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const TASK_SELECT =
  "id, company_id, shop_id, assigned_staff_id, verifier_staff_id, title, description, category, priority, status, due_date, due_time, repeat_type, series_id, materialized_by, photo_required, min_photos, photo_capture_mode, checklist_items, gps_required, feedback_allowed, created_by, started_at, started_by, created_at, updated_at";

function normalizeTask(row: Record<string, unknown>): RetailTaskRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    shop_id: String(row.shop_id),
    assigned_staff_id: row.assigned_staff_id != null ? String(row.assigned_staff_id) : null,
    verifier_staff_id: row.verifier_staff_id != null ? String(row.verifier_staff_id) : null,
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : null,
    category: String(row.category) as TaskCategory,
    priority: String(row.priority ?? "normal") as TaskPriority,
    status: String(row.status ?? "pending") as TaskStatus,
    due_date: String(row.due_date),
    due_time: row.due_time != null ? String(row.due_time).slice(0, 5) : null,
    repeat_type: String(row.repeat_type ?? "one_time") as TaskRepeatType,
    series_id: row.series_id != null ? String(row.series_id) : null,
    materialized_by:
      String(row.materialized_by ?? "initial") === "scheduler" ? "scheduler" : "initial",
    photo_required: row.photo_required === true,
    min_photos: Number.isFinite(Number(row.min_photos))
      ? Math.max(0, Number(row.min_photos))
      : row.photo_required === true
        ? 1
        : 0,
    photo_capture_mode:
      String(row.photo_capture_mode ?? "camera_only") === "camera_or_gallery"
        ? "camera_or_gallery"
        : "camera_only",
    checklist_items: normalizeChecklistItems(row.checklist_items),
    gps_required: row.gps_required === true,
    feedback_allowed: row.feedback_allowed !== false,
    created_by: row.created_by != null ? String(row.created_by) : null,
    started_at: row.started_at != null ? String(row.started_at) : null,
    started_by: row.started_by != null ? String(row.started_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getStaffTaskRole(
  supabase: Supabase,
  companyId: string,
  staffId: string,
): Promise<TaskStaffRole> {
  const { data } = await supabase
    .from("staff_task_roles")
    .select("role")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .maybeSingle();
  const role = String(data?.role ?? "staff");
  if (role === "manager" || role === "supervisor") return role;
  return "staff";
}

export async function getStaffShopIds(supabase: Supabase, staffId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_shop_assignments")
    .select("shop_id")
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.shop_id));
}

export async function listRetailTasks(
  supabase: Supabase,
  params: {
    companyId: string;
    shopId?: string;
    staffId?: string;
    from?: string;
    to?: string;
    status?: string;
  },
): Promise<RetailTaskListItem[]> {
  let q = supabase
    .from("retail_tasks")
    .select(TASK_SELECT)
    .eq("company_id", params.companyId)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: false });

  if (params.shopId) q = q.eq("shop_id", params.shopId);
  if (params.from) q = q.gte("due_date", params.from);
  if (params.to) q = q.lte("due_date", params.to);
  if (params.status) q = q.eq("status", params.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((r) => normalizeTask(r as Record<string, unknown>));

  if (params.staffId) {
    const sid = params.staffId;
    rows = rows.filter(
      (t) =>
        t.assigned_staff_id === sid ||
        t.verifier_staff_id === sid ||
        !t.assigned_staff_id,
    );
  }

  return enrichTaskList(supabase, rows);
}

/** Staff task list: today plus overdue open tasks within lookback window. */
export async function listStaffVisibleShopTasks(
  supabase: Supabase,
  params: {
    companyId: string;
    shopId: string;
    staffId: string;
    date: string;
  },
): Promise<RetailTaskListItem[]> {
  const from = staffTaskListFromYmd(params.date);
  const rows = await listRetailTasks(supabase, {
    companyId: params.companyId,
    shopId: params.shopId,
    staffId: params.staffId,
    from,
    to: params.date,
  });
  return rows.filter((task) => {
    if (task.due_date > params.date) return false;
    if (task.due_date === params.date) return true;
    return WORKABLE_TASK_STATUSES.includes(task.status);
  });
}

async function loadLatestSubmissionsByTaskId(
  supabase: Supabase,
  taskIds: string[],
): Promise<Map<string, { submitted_at: string; overdue_reason: string | null }>> {
  const out = new Map<string, { submitted_at: string; overdue_reason: string | null }>();
  if (taskIds.length === 0) return out;

  const { data, error } = await supabase
    .from("retail_task_submissions")
    .select("task_id, submitted_at, overdue_reason, status")
    .in("task_id", taskIds)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });
  if (error) return out;

  for (const row of data ?? []) {
    const taskId = String(row.task_id);
    if (out.has(taskId)) continue;
    out.set(taskId, {
      submitted_at: String(row.submitted_at),
      overdue_reason: row.overdue_reason != null ? String(row.overdue_reason) : null,
    });
  }
  return out;
}

async function enrichTaskList(
  supabase: Supabase,
  rows: RetailTaskRow[],
): Promise<RetailTaskListItem[]> {
  if (rows.length === 0) return [];

  const shopIds = [...new Set(rows.map((r) => r.shop_id))];
  const staffIds = [
    ...new Set(
      rows.flatMap((r) => [r.assigned_staff_id, r.verifier_staff_id].filter(Boolean) as string[]),
    ),
  ];

  const [shopsRes, staffRes] = await Promise.all([
    supabase.from("shops").select("id, name").in("id", shopIds),
    staffIds.length > 0
      ? supabase.from("staff").select("id, staff_name").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const shopNames = new Map((shopsRes.data ?? []).map((s) => [String(s.id), String(s.name)]));
  const staffNames = new Map((staffRes.data ?? []).map((s) => [String(s.id), String(s.staff_name)]));

  const submittedIds = rows.filter((r) => r.status === "submitted").map((r) => r.id);
  const latestSubmissions = await loadLatestSubmissionsByTaskId(supabase, submittedIds);

  return rows.map((r) => {
    const latest = latestSubmissions.get(r.id);
    return {
      ...r,
      shop_name: shopNames.get(r.shop_id) ?? "Shop",
      assigned_staff_name: r.assigned_staff_id
        ? (staffNames.get(r.assigned_staff_id) ?? null)
        : null,
      verifier_staff_name: r.verifier_staff_id
        ? (staffNames.get(r.verifier_staff_id) ?? null)
        : null,
      latest_submission_at: latest?.submitted_at ?? null,
      latest_overdue_reason: latest?.overdue_reason ?? null,
      display_status: displayTaskStatus(
        r.status,
        r.due_date,
        r.due_time,
        latest?.submitted_at,
      ),
      task_kind: taskKind(r),
    };
  });
}

export async function getRetailTaskById(
  supabase: Supabase,
  taskId: string,
): Promise<RetailTaskRow | null> {
  const { data, error } = await supabase
    .from("retail_tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeTask(data as Record<string, unknown>);
}

export async function createRetailTask(
  supabase: Supabase,
  row: Omit<RetailTaskRow, "id" | "created_at" | "updated_at" | "started_at" | "started_by"> & {
    started_at?: null;
    started_by?: null;
  },
  actor: { name: string; role: string },
): Promise<RetailTaskRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("retail_tasks")
    .insert({
      ...row,
      status: row.status ?? "pending",
      updated_at: now,
    })
    .select(TASK_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create task");

  const task = normalizeTask(data as Record<string, unknown>);
  await logTaskActivity(supabase, {
    task_id: task.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action_type: "created",
    new_status: task.status,
    note: task.title,
  });
  return task;
}

export async function updateRetailTask(
  supabase: Supabase,
  taskId: string,
  patch: Partial<
    Pick<
      RetailTaskRow,
      | "title"
      | "description"
      | "category"
      | "priority"
      | "due_date"
      | "due_time"
      | "repeat_type"
      | "photo_required"
      | "min_photos"
      | "photo_capture_mode"
      | "checklist_items"
      | "gps_required"
      | "feedback_allowed"
      | "assigned_staff_id"
      | "verifier_staff_id"
      | "shop_id"
    >
  >,
  actor: { name: string; role: string },
): Promise<RetailTaskRow> {
  const existing = await getRetailTaskById(supabase, taskId);
  if (!existing) throw new Error("Task not found");

  const { data, error } = await supabase
    .from("retail_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update task");

  const task = normalizeTask(data as Record<string, unknown>);
  await logTaskActivity(supabase, {
    task_id: taskId,
    actor_name: actor.name,
    actor_role: actor.role,
    action_type: "updated",
    old_status: existing.status,
    new_status: task.status,
  });
  return task;
}

export async function deleteRetailTask(
  supabase: Supabase,
  taskId: string,
  actor: { name: string; role: string },
): Promise<void> {
  const existing = await getRetailTaskById(supabase, taskId);
  if (!existing) throw new Error("Task not found");

  // Log before delete: the FK is ON DELETE CASCADE, so inserting an activity row
  // after the task is gone would violate retail_task_activity_logs_task_id_fkey.
  await logTaskActivity(supabase, {
    task_id: taskId,
    actor_name: actor.name,
    actor_role: actor.role,
    action_type: "deleted",
    old_status: existing.status,
    note: existing.title,
  });

  const { error } = await supabase.from("retail_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function setTaskStatus(
  supabase: Supabase,
  taskId: string,
  status: TaskStatus,
  actor: { id?: string | null; name: string; role: string },
  action: "started" | "submitted" | "verified" | "rejected" | "exception_reported" | "status_changed",
  note?: string,
  extra?: Partial<Pick<RetailTaskRow, "started_at" | "started_by">>,
): Promise<RetailTaskRow> {
  const existing = await getRetailTaskById(supabase, taskId);
  if (!existing) throw new Error("Task not found");

  const { data, error } = await supabase
    .from("retail_tasks")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update status");

  const task = normalizeTask(data as Record<string, unknown>);
  await logTaskActivity(supabase, {
    task_id: taskId,
    actor_id: actor.id ?? null,
    actor_name: actor.name,
    actor_role: actor.role,
    action_type: action,
    old_status: existing.status,
    new_status: status,
    note,
  });
  return task;
}

export async function createTaskSubmission(
  supabase: Supabase,
  params: {
    task_id: string;
    submitted_by: string;
    photo_url?: string | null;
    photo_urls?: TaskProofPhotoRecord[];
    checklist_completed?: Record<string, boolean> | null;
    comment?: string | null;
    overdue_reason?: string | null;
    gps_lat?: number | null;
    gps_lng?: number | null;
    gps_distance_meters?: number | null;
    gps_status?: string | null;
  },
): Promise<RetailTaskSubmissionRow> {
  await supabase
    .from("retail_task_submissions")
    .update({ status: "superseded" })
    .eq("task_id", params.task_id)
    .eq("status", "submitted");

  const photo_urls = params.photo_urls ?? [];
  const primaryPhoto =
    photo_urls[0] != null
      ? taskProofDisplayPath(photo_urls[0])
      : params.photo_url ?? null;

  const { data, error } = await supabase
    .from("retail_task_submissions")
    .insert({
      task_id: params.task_id,
      submitted_by: params.submitted_by,
      photo_url: primaryPhoto,
      photo_urls,
      checklist_completed: params.checklist_completed ?? null,
      comment: params.comment ?? null,
      overdue_reason: params.overdue_reason ?? null,
      gps_lat: params.gps_lat ?? null,
      gps_lng: params.gps_lng ?? null,
      gps_distance_meters: params.gps_distance_meters ?? null,
      gps_status: params.gps_status ?? null,
      status: "submitted",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save submission");
  const row = data as Record<string, unknown>;
  return {
    ...(row as RetailTaskSubmissionRow),
    overdue_reason: row.overdue_reason != null ? String(row.overdue_reason) : null,
    photo_urls: normalizePhotoRecords(row.photo_urls, String(row.submitted_at ?? "")),
    checklist_completed:
      row.checklist_completed != null && typeof row.checklist_completed === "object"
        ? (row.checklist_completed as Record<string, boolean>)
        : null,
  };
}

export async function createTaskFeedback(
  supabase: Supabase,
  params: {
    task_id: string;
    submitted_by: string;
    reason_type: string;
    reason_text: string;
    photo_url?: string | null;
    shop_id?: string | null;
    actor_role?: string | null;
  },
): Promise<RetailTaskFeedbackRow> {
  const { data, error } = await supabase
    .from("retail_task_feedback")
    .insert(params)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save feedback");
  return data as RetailTaskFeedbackRow;
}

export async function createTaskVerification(
  supabase: Supabase,
  params: {
    task_id: string;
    submission_id: string | null;
    verifier_id: string | null;
    decision: "accepted" | "fair" | "rejected";
    rejection_reason?: string | null;
    system_score?: number;
    manager_score?: number;
    consistency_bonus?: number;
    final_score?: number;
    score_breakdown?: TaskScoreBreakdown;
  },
): Promise<RetailTaskVerificationRow> {
  const { score_breakdown, ...rest } = params;
  const { data, error } = await supabase
    .from("retail_task_verifications")
    .insert({
      ...rest,
      score_breakdown: score_breakdown ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save verification");
  return normalizeVerificationRow(data as Record<string, unknown>);
}

function normalizeVerificationRow(row: Record<string, unknown>): RetailTaskVerificationRow {
  const breakdown = row.score_breakdown;
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    submission_id: row.submission_id != null ? String(row.submission_id) : null,
    verifier_id: row.verifier_id != null ? String(row.verifier_id) : null,
    decision:
      row.decision === "fair" || row.decision === "rejected" ? row.decision : "accepted",
    rejection_reason:
      typeof row.rejection_reason === "string" ? row.rejection_reason : null,
    verified_at: String(row.verified_at),
    system_score: typeof row.system_score === "number" ? row.system_score : null,
    manager_score: typeof row.manager_score === "number" ? row.manager_score : null,
    consistency_bonus:
      typeof row.consistency_bonus === "number" ? row.consistency_bonus : null,
    final_score: typeof row.final_score === "number" ? row.final_score : null,
    score_breakdown:
      breakdown && typeof breakdown === "object" ? (breakdown as TaskScoreBreakdown) : null,
  };
}

function reviewSummaryFromVerificationRow(row: Record<string, unknown>): TaskReviewSummary {
  const decision =
    row.decision === "fair" || row.decision === "rejected" ? row.decision : "accepted";
  const breakdown = row.score_breakdown;
  const finalScore =
    typeof row.final_score === "number"
      ? row.final_score
      : decision === "fair"
        ? 70
        : decision === "rejected"
          ? 0
          : 100;
  return {
    decision,
    manager_feedback:
      typeof row.rejection_reason === "string" ? row.rejection_reason.trim() || null : null,
    awarded_score: finalScore,
    verified_at: String(row.verified_at),
    score_breakdown:
      breakdown && typeof breakdown === "object" ? (breakdown as TaskScoreBreakdown) : null,
  };
}

export async function getTaskDetailBundle(
  supabase: Supabase,
  taskId: string,
): Promise<{
  task: RetailTaskListItem;
  submissions: RetailTaskSubmissionRow[];
  feedback: RetailTaskFeedbackRow[];
  activity: RetailTaskActivityRow[];
  verifications: RetailTaskVerificationRow[];
} | null> {
  const task = await getRetailTaskById(supabase, taskId);
  if (!task) return null;

  const [enriched, subs, fb, act, ver] = await Promise.all([
    enrichTaskList(supabase, [task]),
    supabase
      .from("retail_task_submissions")
      .select("*")
      .eq("task_id", taskId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("retail_task_feedback")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    supabase
      .from("retail_task_activity_logs")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    supabase
      .from("retail_task_verifications")
      .select("*")
      .eq("task_id", taskId)
      .order("verified_at", { ascending: false }),
  ]);

  const rawSubs = (subs.data ?? []) as RetailTaskSubmissionRow[];
  const submitterIds = [...new Set(rawSubs.map((s) => s.submitted_by).filter(Boolean))];
  let submitterNames = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: staffRows } = await supabase
      .from("staff")
      .select("id, staff_name")
      .in("id", submitterIds);
    submitterNames = new Map(
      (staffRows ?? []).map((s) => [String(s.id), String(s.staff_name)]),
    );
  }

  const submissions = rawSubs.map((s) => ({
    ...s,
    overdue_reason: s.overdue_reason != null ? String(s.overdue_reason) : null,
    photo_urls: normalizePhotoRecords(s.photo_urls, s.submitted_at),
    submitted_by_name: submitterNames.get(s.submitted_by) ?? null,
  }));

  return {
    task: enriched[0]!,
    submissions,
    feedback: (fb.data ?? []) as RetailTaskFeedbackRow[],
    activity: (act.data ?? []) as RetailTaskActivityRow[],
    verifications: (ver.data ?? []) as RetailTaskVerificationRow[],
  };
}

export async function getTaskDashboardStats(
  supabase: Supabase,
  companyId: string,
  date: string,
): Promise<{
  today_total: number;
  pending: number;
  completed: number;
  overdue: number;
  missed: number;
  shops_unfinished: number;
}> {
  const { data, error } = await supabase
    .from("retail_tasks")
    .select("id, shop_id, status, due_date, due_time")
    .eq("company_id", companyId)
    .eq("due_date", date);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    shop_id: string;
    status: TaskStatus;
    due_date: string;
    due_time: string | null;
  }>;

  let pending = 0;
  let completed = 0;
  let overdue = 0;
  let missed = 0;
  const unfinishedShops = new Set<string>();

  for (const r of rows) {
    if (r.status === "missed") {
      missed++;
      continue;
    }
    if (r.status === "verified" || r.status === "exception_reported") {
      completed++;
      continue;
    }

    const display = displayTaskStatus(r.status, r.due_date, r.due_time);
    if (display === "overdue") {
      overdue++;
      unfinishedShops.add(r.shop_id);
      continue;
    }

    if (
      r.status === "pending" ||
      r.status === "in_progress" ||
      r.status === "rejected" ||
      r.status === "submitted"
    ) {
      pending++;
      unfinishedShops.add(r.shop_id);
    }
  }

  return {
    today_total: rows.length,
    pending,
    completed,
    overdue,
    missed,
    shops_unfinished: unfinishedShops.size,
  };
}

export type TaskShopDayCounts = {
  task_count: number;
  overdue: number;
  exceptions: number;
};

/** Per-shop task counts for one or more due dates (Malaysia YMD). */
export async function getTaskShopStatsForDates(
  supabase: Supabase,
  companyId: string,
  dates: string[],
): Promise<Map<string, Map<string, TaskShopDayCounts>>> {
  const byDate = new Map<string, Map<string, TaskShopDayCounts>>();
  if (dates.length === 0) return byDate;

  const { data, error } = await supabase
    .from("retail_tasks")
    .select("shop_id, status, due_date, due_time")
    .eq("company_id", companyId)
    .in("due_date", dates);
  if (error) throw new Error(error.message);

  for (const date of dates) {
    byDate.set(date, new Map());
  }

  for (const row of data ?? []) {
    const dueDate = String(row.due_date);
    const shopId = String(row.shop_id);
    const dayMap = byDate.get(dueDate);
    if (!dayMap) continue;

    const bucket = dayMap.get(shopId) ?? { task_count: 0, overdue: 0, exceptions: 0 };
    bucket.task_count += 1;
    const display = displayTaskStatus(
      row.status as TaskStatus,
      dueDate,
      row.due_time as string | null,
    );
    if (display === "overdue") bucket.overdue += 1;
    if (row.status === "exception_reported") bucket.exceptions += 1;
    dayMap.set(shopId, bucket);
  }

  return byDate;
}

export type StaffTaskReviewCounts = {
  accepted: number;
  fair: number;
  rejected: number;
};

function emptyReviewCounts(): StaffTaskReviewCounts {
  return { accepted: 0, fair: 0, rejected: 0 };
}

/** Latest review per task for list/history views. */
export async function attachLatestTaskReviews(
  supabase: Supabase,
  tasks: RetailTaskListItem[],
): Promise<RetailTaskListItem[]> {
  if (tasks.length === 0) return tasks;
  const taskIds = tasks.map((t) => t.id);
  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(
      "task_id, decision, rejection_reason, verified_at, final_score, score_breakdown, system_score, manager_score, consistency_bonus",
    )
    .in("task_id", taskIds)
    .order("verified_at", { ascending: false });
  if (error) throw new Error(error.message);

  const latestByTask = new Map<string, TaskReviewSummary>();
  for (const row of data ?? []) {
    const taskId = String(row.task_id);
    if (latestByTask.has(taskId)) continue;
    latestByTask.set(taskId, reviewSummaryFromVerificationRow(row as Record<string, unknown>));
  }

  return tasks.map((task) => ({
    ...task,
    latest_review: latestByTask.get(task.id) ?? null,
  }));
}

/** Count review outcomes per submitter staff in a date range. */
export async function getTaskReviewCountsByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<Map<string, StaffTaskReviewCounts>> {
  const counts = new Map<string, StaffTaskReviewCounts>();

  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(
      "decision, verified_at, retail_task_submissions(submitted_by), retail_tasks!inner(company_id)",
    )
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const submission = row.retail_task_submissions as { submitted_by?: string } | null;
    const staffId = submission?.submitted_by;
    if (!staffId) continue;
    const bucket = counts.get(staffId) ?? emptyReviewCounts();
    const raw = String(row.decision ?? "accepted");
    if (raw === "fair") bucket.fair += 1;
    else if (raw === "rejected") bucket.rejected += 1;
    else bucket.accepted += 1;
    counts.set(staffId, bucket);
  }

  return counts;
}

/** Count rejected task proof verifications per submitter staff in a date range. */
export async function getRejectedProofCountsByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(
      "decision, verified_at, retail_task_submissions(submitted_by), retail_tasks!inner(company_id)",
    )
    .eq("decision", "rejected")
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const submission = row.retail_task_submissions as { submitted_by?: string } | null;
    const staffId = submission?.submitted_by;
    if (!staffId) continue;
    counts.set(staffId, (counts.get(staffId) ?? 0) + 1);
  }

  return counts;
}

/** Staff consistency context for composite task scoring. */
export async function getStaffConsistencyContext(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    before_due_date: string;
  },
): Promise<StaffConsistencyContext> {
  const today = malaysiaDateYmd(new Date());
  const since = addDaysYmd(today, -30);

  const { data, error } = await supabase
    .from("retail_tasks")
    .select("id, status, due_date")
    .eq("company_id", params.company_id)
    .eq("assigned_staff_id", params.staff_id)
    .gte("due_date", since)
    .lte("due_date", params.before_due_date)
    .order("due_date", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ status: string; due_date: string }>;

  let consecutive_completed = 0;
  for (const row of rows) {
    if (row.status === "verified" || row.status === "fair") {
      consecutive_completed += 1;
    } else {
      break;
    }
  }

  let missed_tasks_last_30_days = 0;
  let completed = 0;
  let closed = 0;
  for (const row of rows) {
    if (row.status === "missed") missed_tasks_last_30_days += 1;
    if (row.status === "verified" || row.status === "fair") completed += 1;
    if (
      row.status === "verified" ||
      row.status === "fair" ||
      row.status === "rejected" ||
      row.status === "missed"
    ) {
      closed += 1;
    }
  }

  const completion_rate_last_30_days = closed > 0 ? completed / closed : null;

  return {
    consecutive_completed,
    missed_tasks_last_30_days,
    completion_rate_last_30_days,
  };
}

/** Average final task scores per submitter in a date range (reliability integration). */
export async function getAverageFinalTaskScoresByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<Map<string, number>> {
  const averages = new Map<string, number>();

  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(
      "final_score, verified_at, retail_task_submissions(submitted_by), retail_tasks!inner(company_id)",
    )
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso)
    .not("final_score", "is", null);
  if (error) throw new Error(error.message);

  const sums = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
    const submission = row.retail_task_submissions as { submitted_by?: string } | null;
    const staffId = submission?.submitted_by;
    const score = typeof row.final_score === "number" ? row.final_score : null;
    if (!staffId || score == null) continue;
    const bucket = sums.get(staffId) ?? { total: 0, count: 0 };
    bucket.total += score;
    bucket.count += 1;
    sums.set(staffId, bucket);
  }

  for (const [staffId, { total, count }] of sums) {
    averages.set(staffId, Math.round(total / count));
  }
  return averages;
}

/** Manager review rows for bias analytics (analytics only — no auto-override). */
export async function getManagerReviewsForAnalytics(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<
  Array<{ verifier_id: string | null; verifier_name: string | null; decision: string }>
> {
  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(
      "decision, verifier_id, staff:verifier_id(staff_name), retail_tasks!inner(company_id)",
    )
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso)
    .not("verifier_id", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const staff = row.staff as { staff_name?: string } | null;
    return {
      verifier_id: row.verifier_id != null ? String(row.verifier_id) : null,
      verifier_name: staff?.staff_name ?? null,
      decision: String(row.decision ?? "accepted"),
    };
  });
}

export async function getLatestSubmission(
  supabase: Supabase,
  taskId: string,
): Promise<RetailTaskSubmissionRow | null> {
  const { data } = await supabase
    .from("retail_task_submissions")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    ...(row as RetailTaskSubmissionRow),
    overdue_reason: row.overdue_reason != null ? String(row.overdue_reason) : null,
    photo_urls: normalizePhotoRecords(row.photo_urls, String(row.submitted_at ?? "")),
  };
}
