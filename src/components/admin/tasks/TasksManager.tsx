"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { TaskChecklistEditor } from "@/components/admin/tasks/TaskChecklistEditor";
import { TaskShopMultiSelect } from "@/components/admin/tasks/TaskShopMultiSelect";
import { TaskPhotoViewer } from "@/components/admin/tasks/TaskPhotoViewer";
import { TaskKindBadge } from "@/components/admin/tasks/TaskKindBadge";
import { TaskStatusBadge } from "@/components/admin/tasks/TaskStatusBadge";
import { dashboardCard, dashboardPrimaryBtn } from "@/components/admin/report/dashboard-ui";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  formatOverdueDuration,
  minutesLate,
} from "@/lib/retail-tasks/task-overdue";
import {
  formatTaskProofPhotoTimestamp,
  taskProofDisplayPath,
} from "@/lib/retail-tasks/task-proof-photos";
import { isRecurringTask, type TaskDeleteScope } from "@/lib/retail-tasks/task-kind";
import {
  FEEDBACK_REASON_TYPES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_REPEAT_TYPES,
  TASK_STATUSES,
  type RetailTaskListItem,
  type RetailTaskSubmissionRow,
  type TaskCategory,
  type TaskChecklistItem,
  type TaskProofPhotoRecord,
  type TaskStatus,
} from "@/lib/retail-tasks/types";

type Shop = { id: string; name: string };
type EligibleStaff = {
  id: string;
  staff_name: string;
  staff_code: string;
  role_template?: string;
  other_shop?: boolean;
};

type DashboardStats = {
  today_total: number;
  pending: number;
  completed: number;
  overdue: number;
  missed: number;
  shops_unfinished: number;
};

type TaskBundle = {
  task: RetailTaskListItem;
  submissions: RetailTaskSubmissionRow[];
  feedback: Array<Record<string, unknown>>;
  activity: Array<{
    id: string;
    action_type: string;
    actor_name: string;
    actor_role: string;
    old_status: string | null;
    new_status: string | null;
    note: string | null;
    created_at: string;
  }>;
  verifications: Array<Record<string, unknown>>;
};

type PhotoPreset = "none" | "1" | "3" | "5" | "custom";

type TabId = "dashboard" | "all" | "create";

async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function TasksManager() {
  const { t } = useI18n();
  const { toast, showSuccess, showError, dismiss } = useAdminToast();
  const today = malaysiaDateYmd(new Date());

  const [tab, setTab] = useState<TabId>("dashboard");
  const [shops, setShops] = useState<Shop[]>([]);
  const [assignees, setAssignees] = useState<EligibleStaff[]>([]);
  const [verifiers, setVerifiers] = useState<EligibleStaff[]>([]);
  const [showCrossShopStaff, setShowCrossShopStaff] = useState(false);
  const [tasks, setTasks] = useState<RetailTaskListItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterShop, setFilterShop] = useState("");
  const [filterDate, setFilterDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskBundle | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [viewerPaths, setViewerPaths] = useState<string[]>([]);
  const [deletePrompt, setDeletePrompt] = useState<RetailTaskListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "opening_checklist" as TaskCategory,
    shop_ids: [] as string[],
    assigned_staff_id: "",
    verifier_staff_id: "",
    due_date: today,
    due_time: "09:00",
    repeat_type: "one_time",
    photo_preset: "1" as PhotoPreset,
    min_photos_custom: 2,
    photo_capture_mode: "camera_only" as "camera_only" | "camera_or_gallery",
    checklist_items: [] as TaskChecklistItem[],
    gps_required: false,
    feedback_allowed: true,
    priority: "normal",
    notify_assigned_staff: true,
    notify_supervisor: false,
    notify_store_manager: false,
    reminder_minutes: "" as "" | "15" | "30" | "60",
  });
  const [creating, setCreating] = useState(false);

  const primaryShopId = form.shop_ids.length === 1 ? form.shop_ids[0]! : "";

  const loadEligibleStaff = useCallback(async () => {
    if (!primaryShopId) {
      setAssignees([]);
      setVerifiers([]);
      return;
    }
    const base = new URLSearchParams({ shop_id: primaryShopId });
    const assignQs = new URLSearchParams(base);
    assignQs.set("role", "assignee");
    assignQs.set("task_date", form.due_date);
    if (showCrossShopStaff) assignQs.set("include_cross_shop", "true");
    const verifierQs = new URLSearchParams(base);
    verifierQs.set("role", "verifier");

    const [assignRes, verifierRes] = await Promise.all([
      fetch(`/api/staff/task-eligible?${assignQs}`, { credentials: "include" }),
      fetch(`/api/staff/task-eligible?${verifierQs}`, { credentials: "include" }),
    ]);
    if (assignRes.ok) {
      const j = (await assignRes.json()) as { staff?: EligibleStaff[] };
      setAssignees(j.staff ?? []);
    }
    if (verifierRes.ok) {
      const j = (await verifierRes.json()) as { staff?: EligibleStaff[] };
      setVerifiers(j.staff ?? []);
    }
  }, [primaryShopId, form.due_date, showCrossShopStaff]);

  const loadMeta = useCallback(async () => {
    const shopsRes = await fetch("/api/shops", { credentials: "include" });
    if (shopsRes.ok) {
      const j = (await shopsRes.json()) as { shops?: Shop[] };
      const loaded = j.shops ?? [];
      setShops(loaded);
      setForm((f) => {
        if (f.shop_ids.length > 0) return f;
        return loaded.length > 0 ? { ...f, shop_ids: [loaded[0]!.id] } : f;
      });
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: filterDate, to: filterDate });
      if (filterShop) qs.set("shop_id", filterShop);
      if (filterStatus) qs.set("status", filterStatus);
      const res = await fetch(`/api/admin/retail-tasks?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await readErr(res));
      const j = (await res.json()) as { tasks?: RetailTaskListItem[] };
      setTasks(j.tasks ?? []);
    } catch (e) {
      showError(e instanceof Error ? e.message : t("tasks.form.failed"));
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterShop, filterStatus, showError, t]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/retail-tasks/dashboard?date=${filterDate}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readErr(res));
      const j = (await res.json()) as { stats?: DashboardStats };
      setStats(j.stats ?? null);
    } catch {
      setStats(null);
    }
  }, [filterDate]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadEligibleStaff();
  }, [loadEligibleStaff]);

  useEffect(() => {
    void loadTasks();
    void loadDashboard();
  }, [loadTasks, loadDashboard]);

  async function openDetail(taskId: string) {
    setDetailId(taskId);
    setDetail(null);
    setReviewFeedback("");
    setReviewError(null);
    try {
      const res = await fetch(`/api/admin/retail-tasks/${encodeURIComponent(taskId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readErr(res));
      setDetail((await res.json()) as TaskBundle);
    } catch (e) {
      showError(e instanceof Error ? e.message : t("tasks.form.failed"));
      setDetailId(null);
    }
  }

  async function verifyTask(decision: "accepted" | "fair" | "rejected") {
    if (!detailId || detailBusy) return;
    if (decision === "rejected" && !reviewFeedback.trim()) {
      setReviewError(t("tasks.detail.rejectRequired"));
      return;
    }
    setReviewError(null);
    setDetailBusy(true);
    try {
      const res = await fetch(`/api/admin/retail-tasks/${encodeURIComponent(detailId)}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          manager_feedback: reviewFeedback.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const successKey =
        decision === "accepted"
          ? "tasks.detail.accepted"
          : decision === "fair"
            ? "tasks.detail.fairDone"
            : "tasks.detail.rejected";
      showSuccess(t(successKey));
      setReviewFeedback("");
      await openDetail(detailId);
      void loadTasks();
      void loadDashboard();
    } catch (e) {
      showError(e instanceof Error ? e.message : t("tasks.form.failed"));
    } finally {
      setDetailBusy(false);
    }
  }

  function promptDelete(task: RetailTaskListItem) {
    if (isRecurringTask(task)) {
      setDeletePrompt(task);
      return;
    }
    if (!window.confirm(t("tasks.list.deleteConfirm"))) return;
    void runDelete(task.id, "occurrence");
  }

  async function runDelete(taskId: string, scope: TaskDeleteScope) {
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/retail-tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted_count?: number;
      };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      if (scope === "future") {
        showSuccess(
          t("tasks.list.deletedFuture").replace("{count}", String(payload.deleted_count ?? 0)),
        );
      } else {
        showSuccess(t("tasks.list.deletedOccurrence"));
      }
      setDeletePrompt(null);
      if (detailId === taskId) setDetailId(null);
      void loadTasks();
      void loadDashboard();
    } catch (e) {
      showError(e instanceof Error ? e.message : t("tasks.form.failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function createTask() {
    if (!form.title.trim() || form.shop_ids.length === 0) return;
    setCreating(true);
    try {
      const min_photos =
        form.photo_preset === "none"
          ? 0
          : form.photo_preset === "custom"
            ? Math.max(0, form.min_photos_custom)
            : Number(form.photo_preset);
      const singleShop = form.shop_ids.length === 1;
      const res = await fetch("/api/admin/retail-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shop_ids: form.shop_ids,
          min_photos,
          photo_required: min_photos > 0,
          checklist_items: form.checklist_items.filter((i) => i.label.trim()),
          assigned_staff_id: singleShop ? form.assigned_staff_id || null : null,
          verifier_staff_id: singleShop ? form.verifier_staff_id || null : null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        created_by_shop?: Array<{ shop_name: string; instances_created: number }>;
        skipped_duplicates?: Array<{ shop_name: string }>;
        instances_created?: number;
      };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);

      const createdCount = payload.instances_created ?? 0;
      const shopCount = payload.created_by_shop?.length ?? form.shop_ids.length;
      let message = t("tasks.form.saved");
      if (shopCount > 1) {
        message = t("tasks.form.savedMulti")
          .replace("{shops}", String(shopCount))
          .replace("{instances}", String(createdCount));
      }
      if ((payload.skipped_duplicates?.length ?? 0) > 0) {
        const names = payload.skipped_duplicates!.map((d) => d.shop_name).join(", ");
        message = `${message} ${t("tasks.form.skippedDuplicates").replace("{shops}", names)}`;
      }
      showSuccess(message);
      setTab("all");
      setForm((f) => ({ ...f, title: "", description: "" }));
      void loadTasks();
      void loadDashboard();
    } catch (e) {
      showError(e instanceof Error ? e.message : t("tasks.form.failed"));
    } finally {
      setCreating(false);
    }
  }

  const latestSubmission = useMemo(() => {
    if (!detail) return null;
    return (
      detail.submissions.find((s) => s.status === "submitted") ?? detail.submissions[0] ?? null
    );
  }, [detail]);

  const completionRate =
    stats && stats.today_total > 0
      ? Math.round((stats.completed / stats.today_total) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold text-[#0F172A]">{t("tasks.title")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">{t("tasks.subtitle")}</p>
        <p className="mt-2 text-xs text-zinc-500">{t("tasks.whatsappNote")}</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        {(["dashboard", "all", "create"] as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === id
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {t(`tasks.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === "dashboard" && stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("tasks.dashboard.todayTotal"), value: stats.today_total },
            { label: t("tasks.dashboard.pending"), value: stats.pending },
            { label: t("tasks.dashboard.completed"), value: stats.completed },
            { label: t("tasks.dashboard.overdue"), value: stats.overdue },
            { label: t("tasks.dashboard.missed"), value: stats.missed },
            { label: t("tasks.dashboard.shopsUnfinished"), value: stats.shops_unfinished },
            {
              label: t("tasks.dashboard.completionRate"),
              value: `${completionRate}%`,
            },
          ].map((item) => (
            <div key={item.label} className={dashboardCard}>
              <p className="text-xs text-zinc-500">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {(tab === "dashboard" || tab === "all") && (
        <div className={`${dashboardCard} space-y-3`}>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-zinc-500">
              {t("tasks.filters.date")}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="ml-1 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              {t("tasks.filters.shop")}
              <select
                value={filterShop}
                onChange={(e) => setFilterShop(e.target.value)}
                className="ml-1 rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                <option value="">{t("tasks.filters.allShops")}</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              {t("tasks.filters.status")}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="ml-1 rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                <option value="">{t("tasks.filters.allStatuses")}</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`tasks.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">{t("tasks.loading")}</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("tasks.list.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-zinc-500">
                    <th className="py-2 pr-2">{t("tasks.form.title")}</th>
                    <th className="py-2 pr-2">{t("tasks.filters.shop")}</th>
                    <th className="py-2 pr-2">{t("tasks.list.assigned")}</th>
                    <th className="py-2 pr-2">{t("tasks.list.due")}</th>
                    <th className="py-2 pr-2">{t("tasks.list.taskType")}</th>
                    <th className="py-2 pr-2">{t("tasks.filters.status")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const displayStatus = (task.display_status ?? task.status) as TaskStatus;
                    return (
                      <tr key={task.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-2 font-medium">{task.title}</td>
                        <td className="py-2 pr-2">{task.shop_name}</td>
                        <td className="py-2 pr-2">
                          {task.assigned_staff_name ?? t("tasks.form.unassigned")}
                        </td>
                        <td className="py-2 pr-2">
                          {task.due_date}
                          {task.due_time ? ` ${task.due_time}` : ""}
                        </td>
                        <td className="py-2 pr-2">
                          <TaskKindBadge task={task} kind={task.task_kind} />
                        </td>
                        <td className="py-2 pr-2">
                          <TaskStatusBadge status={displayStatus} />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void openDetail(task.id)}
                            className="text-xs font-semibold text-blue-600"
                          >
                            {t("tasks.list.view")}
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDelete(task)}
                            className="ml-2 text-xs font-semibold text-red-600"
                          >
                            {t("tasks.list.delete")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "create" && (
        <div className={`${dashboardCard} grid gap-3 sm:grid-cols-2`}>
          <label className="block text-sm">
            {t("tasks.form.title")}
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div className="block text-sm sm:col-span-2">
            <span className="font-medium">{t("tasks.form.shops")}</span>
            <div className="mt-1">
              <TaskShopMultiSelect
                shops={shops}
                selectedIds={form.shop_ids}
                onChange={(shop_ids) =>
                  setForm((f) => ({
                    ...f,
                    shop_ids,
                    assigned_staff_id: shop_ids.length === 1 ? f.assigned_staff_id : "",
                    verifier_staff_id: shop_ids.length === 1 ? f.verifier_staff_id : "",
                  }))
                }
                disabled={creating}
              />
            </div>
          </div>
          <label className="block text-sm sm:col-span-2">
            {t("tasks.form.description")}
            <textarea
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            {t("tasks.form.category")}
            <select
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as TaskCategory }))
              }
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`tasks.category.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {t("tasks.form.priority")}
            <select
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`tasks.priority.${p}`)}
                </option>
              ))}
            </select>
          </label>
          {form.shop_ids.length === 1 ? (
            <>
              <label className="flex items-center gap-2 text-xs text-zinc-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={showCrossShopStaff}
                  onChange={(e) => setShowCrossShopStaff(e.target.checked)}
                />
                {t("tasks.form.showCrossShopStaff")}
              </label>
              <label className="block text-sm">
                {t("tasks.form.assignStaff")}
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                  value={form.assigned_staff_id}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_staff_id: e.target.value }))}
                >
                  <option value="">{t("tasks.form.unassigned")}</option>
                  {assignees.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.staff_name} ({s.staff_code})
                      {s.other_shop ? ` — ${t("tasks.form.otherShopBadge")}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {t("tasks.form.verifier")}
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                  value={form.verifier_staff_id}
                  onChange={(e) => setForm((f) => ({ ...f, verifier_staff_id: e.target.value }))}
                >
                  <option value="">{t("tasks.form.selectVerifier")}</option>
                  {verifiers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.staff_name} ({s.staff_code})
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p className="text-xs text-zinc-600 sm:col-span-2">{t("tasks.form.multiShopAssigneeNote")}</p>
          )}
          <label className="block text-sm">
            {t("tasks.form.dueDate")}
            <input
              type="date"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            {t("tasks.form.dueTime")}
            <input
              type="time"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.due_time}
              onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            {t("tasks.form.repeat")}
            <select
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={form.repeat_type}
              onChange={(e) => setForm((f) => ({ ...f, repeat_type: e.target.value }))}
            >
              {TASK_REPEAT_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(`tasks.repeat.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 text-sm sm:col-span-2">
            <label className="block">
              {t("tasks.form.minPhotos")}
              <select
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                value={form.photo_preset}
                onChange={(e) =>
                  setForm((f) => ({ ...f, photo_preset: e.target.value as PhotoPreset }))
                }
              >
                <option value="none">{t("tasks.form.photosNone")}</option>
                <option value="1">{t("tasks.form.photosMin1")}</option>
                <option value="3">{t("tasks.form.photosMin3")}</option>
                <option value="5">{t("tasks.form.photosMin5")}</option>
                <option value="custom">{t("tasks.form.photosCustom")}</option>
              </select>
            </label>
            {form.photo_preset === "custom" ? (
              <label className="block">
                {t("tasks.form.photosCustomCount")}
                <input
                  type="number"
                  min={0}
                  max={20}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                  value={form.min_photos_custom}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      min_photos_custom: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </label>
            ) : null}
            <label className="block">
              {t("tasks.form.photoCaptureMode")}
              <select
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                value={form.photo_capture_mode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    photo_capture_mode: e.target.value as "camera_only" | "camera_or_gallery",
                  }))
                }
              >
                <option value="camera_only">{t("tasks.form.captureCameraOnly")}</option>
                <option value="camera_or_gallery">{t("tasks.form.captureCameraOrGallery")}</option>
              </select>
            </label>
            <TaskChecklistEditor
              items={form.checklist_items}
              onChange={(checklist_items) => setForm((f) => ({ ...f, checklist_items }))}
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.gps_required}
                onChange={(e) => setForm((f) => ({ ...f, gps_required: e.target.checked }))}
              />
              {t("tasks.form.gpsRequired")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.feedback_allowed}
                onChange={(e) => setForm((f) => ({ ...f, feedback_allowed: e.target.checked }))}
              />
              {t("tasks.form.feedbackAllowed")}
            </label>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2">
            <p className="text-sm font-semibold text-zinc-800">{t("notifications.taskSettings.title")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.notify_assigned_staff}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notify_assigned_staff: e.target.checked }))
                  }
                />
                {t("notifications.taskSettings.notifyAssigned")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.notify_supervisor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notify_supervisor: e.target.checked }))
                  }
                />
                {t("notifications.taskSettings.notifySupervisor")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.notify_store_manager}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notify_store_manager: e.target.checked }))
                  }
                />
                {t("notifications.taskSettings.notifyStoreManager")}
              </label>
              <label className="block text-sm">
                {t("notifications.taskSettings.reminder")}
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
                  value={form.reminder_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      reminder_minutes: e.target.value as "" | "15" | "30" | "60",
                    }))
                  }
                >
                  <option value="">{t("notifications.taskSettings.reminderNone")}</option>
                  <option value="15">{t("notifications.taskSettings.reminder15")}</option>
                  <option value="30">{t("notifications.taskSettings.reminder30")}</option>
                  <option value="60">{t("notifications.taskSettings.reminder60")}</option>
                </select>
              </label>
            </div>
          </div>
          <button
            type="button"
            disabled={creating || !form.title.trim() || form.shop_ids.length === 0}
            onClick={() => void createTask()}
            className={dashboardPrimaryBtn}
          >
            {creating ? t("tasks.form.creating") : t("tasks.form.create")}
          </button>
        </div>
      )}

      {detailId && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[90vh] sm:rounded-2xl">
            {!detail ? (
              <p className="p-4 text-sm text-zinc-500">{t("tasks.loading")}</p>
            ) : (
              <>
              <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                <h2 className="text-lg font-semibold">{detail.task.title}</h2>
                <p className="text-xs text-zinc-500">
                  {detail.task.shop_name} · {detail.task.due_date}
                  {detail.task.due_time ? ` ${detail.task.due_time}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TaskStatusBadge
                    status={(detail.task.display_status ?? detail.task.status) as TaskStatus}
                  />
                  <TaskKindBadge task={detail.task} />
                </div>
                {detail.task.description ? (
                  <p className="mt-3 text-sm text-zinc-700">{detail.task.description}</p>
                ) : null}

                {latestSubmission ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 p-3">
                    <p className="text-xs font-semibold uppercase text-zinc-500">
                      {t("tasks.detail.submissions")}
                    </p>
                    <p className="text-sm text-zinc-700">
                      {t("tasks.detail.submittedBy")}:{" "}
                      <span className="font-medium">
                        {latestSubmission.submitted_by_name ?? latestSubmission.submitted_by}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {t("tasks.detail.submittedAt")}: {latestSubmission.submitted_at}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {t("tasks.detail.dueAt")}: {detail.task.due_date}
                      {detail.task.due_time ? ` ${detail.task.due_time}` : ""}
                    </p>
                    {minutesLate(
                      latestSubmission.submitted_at,
                      detail.task.due_date,
                      detail.task.due_time,
                    ) > 0 ? (
                      <p className="text-xs text-orange-700">
                        {t("tasks.detail.overdueDuration")}:{" "}
                        {formatOverdueDuration(
                          minutesLate(
                            latestSubmission.submitted_at,
                            detail.task.due_date,
                            detail.task.due_time,
                          ),
                        )}
                      </p>
                    ) : null}
                    {latestSubmission.overdue_reason ? (
                      <p className="text-sm text-zinc-700">
                        <span className="font-medium">{t("tasks.detail.overdueReason")}: </span>
                        {latestSubmission.overdue_reason}
                      </p>
                    ) : null}
                    {latestSubmission.comment ? (
                      <p className="text-sm text-zinc-600">{latestSubmission.comment}</p>
                    ) : null}

                    {(detail.task.checklist_items ?? []).length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-zinc-600">
                          {t("tasks.form.checklistTitle")}
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {[...(detail.task.checklist_items ?? [])]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((item) => {
                              const done =
                                latestSubmission.checklist_completed?.[item.id] === true;
                              return (
                                <li key={item.id} className="flex items-center gap-2">
                                  <span
                                    className={
                                      done
                                        ? "text-emerald-600"
                                        : item.required
                                          ? "text-red-600"
                                          : "text-zinc-400"
                                    }
                                  >
                                    {done ? "✓" : "○"}
                                  </span>
                                  {item.label}
                                  {!item.required ? (
                                    <span className="text-[10px] text-zinc-400">
                                      ({t("tasks.staff.checklistOptional")})
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    ) : null}

                    {(latestSubmission.photo_urls?.length ?? 0) > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-zinc-600">
                          {t("tasks.detail.photos")} ({latestSubmission.photo_urls.length})
                        </p>
                        <ul className="mt-2 grid grid-cols-3 gap-2">
                          {latestSubmission.photo_urls.map((photo, i) => (
                            <li key={photo.display_path}>
                              <button
                                type="button"
                                onClick={() =>
                                  setViewerPaths(
                                    latestSubmission.photo_urls.map(taskProofDisplayPath),
                                  )
                                }
                                className="block w-full overflow-hidden rounded border border-zinc-200"
                              >
                                <TaskProofThumb photo={photo} />
                              </button>
                              <p className="mt-0.5 text-center text-[9px] text-zinc-500">
                                {formatTaskProofPhotoTimestamp(photo.captured_at)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {detail.task.status === "submitted" ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <label className="block text-xs font-medium text-zinc-700">
                      {t("tasks.detail.managerFeedback")}
                      <textarea
                        className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                        placeholder={t("tasks.detail.feedbackHint")}
                        value={reviewFeedback}
                        onChange={(e) => {
                          setReviewFeedback(e.target.value);
                          if (reviewError) setReviewError(null);
                        }}
                      />
                    </label>
                    {reviewError ? (
                      <p className="text-xs font-medium text-red-600">{reviewError}</p>
                    ) : null}
                  </div>
                ) : null}

                {detail.verifications.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                    <p className="text-xs font-semibold uppercase text-zinc-500">
                      {t("tasks.detail.verifications")}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {detail.verifications.map((v, idx) => {
                        const decision =
                          v.decision === "fair" || v.decision === "rejected" ? v.decision : "accepted";
                        const score = decision === "fair" ? 70 : decision === "rejected" ? 0 : 100;
                        const feedback =
                          typeof v.rejection_reason === "string" ? v.rejection_reason : null;
                        return (
                          <li
                            key={String(v.id ?? idx)}
                            className="rounded border border-zinc-200 bg-white px-2 py-1.5"
                          >
                            <p className="font-semibold">
                              {t(`tasks.review.${decision}`)}
                              {" · "}
                              {t("tasks.detail.awardedScore").replace("{score}", String(score))}
                            </p>
                            {feedback ? (
                              <p className="mt-0.5 text-xs text-zinc-600">{feedback}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    {t("tasks.detail.activity")}
                  </p>
                  {detail.activity.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t("tasks.detail.noActivity")}</p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                      {detail.activity.map((a) => (
                        <li key={a.id} className="rounded bg-zinc-50 px-2 py-1">
                          <span className="font-semibold">
                            {t(`tasks.action.${a.action_type}` as `tasks.action.${string}`) ||
                              a.action_type}
                          </span>{" "}
                          — {a.actor_name} ({a.actor_role})
                          {a.note ? ` — ${a.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {detail.task.status === "submitted" ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={detailBusy}
                      onClick={() => void verifyTask("accepted")}
                      className="flex-1 rounded bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {detailBusy ? t("tasks.detail.reviewing") : t("tasks.detail.accept")}
                    </button>
                    <button
                      type="button"
                      disabled={detailBusy}
                      onClick={() => void verifyTask("fair")}
                      className="flex-1 rounded bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {detailBusy ? t("tasks.detail.reviewing") : t("tasks.detail.fair")}
                    </button>
                    <button
                      type="button"
                      disabled={detailBusy}
                      onClick={() => void verifyTask("rejected")}
                      className="flex-1 rounded bg-red-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {detailBusy ? t("tasks.detail.reviewing") : t("tasks.detail.reject")}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={() => {
                    setDetailId(null);
                    setDetail(null);
                  }}
                  className={`w-full rounded border border-zinc-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                    detail.task.status === "submitted" ? "mt-2" : ""
                  }`}
                >
                  {t("tasks.detail.close")}
                </button>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewerPaths.length > 0 ? (
        <TaskPhotoViewer paths={viewerPaths} onClose={() => setViewerPaths([])} />
      ) : null}

      {deletePrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${dashboardCard} w-full max-w-md space-y-3`}>
            <h3 className="font-semibold text-zinc-900">{t("tasks.list.deleteRecurringTitle")}</h3>
            <p className="text-sm text-zinc-600">{t("tasks.list.deleteRecurringHint")}</p>
            <p className="text-sm font-medium text-zinc-800">{deletePrompt.title}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void runDelete(deletePrompt.id, "occurrence")}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                {t("tasks.list.deleteOccurrence")}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void runDelete(deletePrompt.id, "future")}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
              >
                {t("tasks.list.deleteFuture")}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeletePrompt(null)}
                className="rounded-lg px-3 py-2 text-sm text-zinc-500"
              >
                {t("button.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={dismiss} />
    </div>
  );
}

function TaskProofThumb({ photo }: { photo: TaskProofPhotoRecord }) {
  const [url, setUrl] = useState<string | null>(null);
  const path = taskProofDisplayPath(photo);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const qs = new URLSearchParams({ path });
      const res = await fetch(`/api/admin/retail-tasks/photo?${qs}`, { credentials: "include" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { url?: string };
      if (!cancelled) setUrl(j.url ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <div className="flex aspect-square items-center justify-center bg-zinc-100 text-[10px] text-zinc-400">
        …
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="aspect-square w-full object-cover"
    />
  );
}
