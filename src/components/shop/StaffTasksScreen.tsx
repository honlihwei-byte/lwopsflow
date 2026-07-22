"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { TaskStatusBadge } from "@/components/admin/tasks/TaskStatusBadge";
import { TaskSubmissionForm, type TaskSubmitResult } from "@/components/shop/TaskSubmissionForm";
import {
  isStaffWorkableStatus,
} from "@/lib/retail-tasks/task-permissions";
import {
  FEEDBACK_REASON_TYPES,
  type RetailTaskListItem,
  type TaskStatus,
} from "@/lib/retail-tasks/types";

type Staff = { id: string; staff_name: string; staff_code: string };

async function readErr(
  res: Response,
  t: (key: string) => string,
): Promise<{ message: string; code?: string; debug?: Record<string, unknown> }> {
  try {
    const j = (await res.json()) as {
      error?: string;
      code?: string;
      debug?: Record<string, unknown>;
    };
    if (j.debug) {
      console.warn("[task-action] failed", j.debug);
    }
    const code = j.code;
    const i18nKey = code ? `tasks.staff.failure.${code}` : "";
    const translated = code ? t(i18nKey) : "";
    const message =
      translated && translated !== i18nKey ? translated : j.error || `HTTP ${res.status}`;
    return { message, code, debug: j.debug };
  } catch {
    return { message: `HTTP ${res.status}` };
  }
}

export function StaffTasksScreen({
  shopId,
  shopName,
  companyName,
  shopStaff,
  initialStaffId = "",
}: {
  shopId: string;
  shopName: string;
  companyName: string;
  shopStaff: Staff[];
  initialStaffId?: string;
}) {
  const { t } = useI18n();
  const [selectedStaffId, setSelectedStaffId] = useState(initialStaffId);
  const [tasks, setTasks] = useState<RetailTaskListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exceptionTaskId, setExceptionTaskId] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState(FEEDBACK_REASON_TYPES[0]);
  const [reasonText, setReasonText] = useState("");

  const selectedStaffName = useMemo(
    () => shopStaff.find((s) => s.id === selectedStaffId)?.staff_name ?? "",
    [shopStaff, selectedStaffId],
  );

  const load = useCallback(async () => {
    if (!selectedStaffId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ staff_id: selectedStaffId });
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/retail-tasks?${qs}`,
      );
      if (!res.ok) throw new Error((await readErr(res, t)).message);
      const j = (await res.json()) as { tasks?: RetailTaskListItem[] };
      setTasks(j.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tasks.form.failed"));
    } finally {
      setLoading(false);
    }
  }, [selectedStaffId, shopId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function taskAction(
    taskId: string,
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<TaskSubmitResult> {
    setBusy(true);
    if (action !== "submit") setError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/retail-tasks/${encodeURIComponent(taskId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staff_id: selectedStaffId, action, ...extra }),
        },
      );
      if (!res.ok) {
        const err = await readErr(res, t);
        if (action !== "submit") {
          setError(err.message);
        }
        return { ok: false, message: err.message, code: err.code };
      }
      if (action === "submit") {
        setActiveTaskId(null);
        setExceptionTaskId(null);
        setReasonText("");
      }
      await load();
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : t("tasks.form.failed");
      if (action !== "submit") {
        setError(message);
      }
      return { ok: false, message };
    } finally {
      setBusy(false);
    }
  }

  async function openTask(task: RetailTaskListItem) {
    if (task.status === "pending" || task.status === "rejected" || task.status === "missed") {
      const result = await taskAction(task.id, "start");
      if (!result.ok) return;
    }
    setActiveTaskId(task.id);
    setExceptionTaskId(null);
  }

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">{t("tasks.staff.title")}</h1>
        <p className="text-sm text-zinc-500">{t("tasks.staff.subtitle")}</p>
        <p className="mt-1 text-xs text-zinc-400">{shopName}</p>
      </header>

      <label className="block text-sm">
        {t("tasks.staff.selectStaff")}
        <select
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          value={selectedStaffId}
          onChange={(e) => {
            setSelectedStaffId(e.target.value);
            setActiveTaskId(null);
          }}
        >
          <option value="">—</option>
          {shopStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.staff_name} ({s.staff_code})
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">{t("tasks.loading")}</p> : null}

      {!selectedStaffId ? null : tasks.length === 0 && !loading ? (
        <p className="text-sm text-zinc-500">{t("tasks.staff.noTasks")}</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => {
            const dbStatus = task.status;
            const displayStatus = (task.display_status ?? task.status) as TaskStatus;
            const isOpen = activeTaskId === task.id;
            const isException = exceptionTaskId === task.id;
            const canWork = isStaffWorkableStatus(dbStatus);
            const assignedToOther =
              Boolean(task.assigned_staff_id) && task.assigned_staff_id !== selectedStaffId;

            if (selectedStaffId && !canWork && displayStatus === "overdue") {
              console.debug("[task-action] task not workable", {
                task_id: task.id,
                task_status: dbStatus,
                display_status: displayStatus,
                assigned_staff_id: task.assigned_staff_id,
                selected_staff_id: selectedStaffId,
                due_date: task.due_date,
                due_time: task.due_time,
              });
            }

            if (selectedStaffId && canWork && assignedToOther) {
              console.debug("[task-action] assignment mismatch", {
                task_id: task.id,
                assigned_staff_id: task.assigned_staff_id,
                selected_staff_id: selectedStaffId,
                failure_reason: "task_not_assigned_to_you",
              });
            }

            return (
              <li key={task.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900">{task.title}</p>
                    <p className="text-xs text-zinc-500">
                      {t(`tasks.category.${task.category}` as "tasks.category.cleaning_check")}
                      {" · "}
                      {task.due_date}
                      {task.due_time ? ` · ${task.due_time}` : ""}
                    </p>
                  </div>
                  <TaskStatusBadge status={displayStatus} />
                </div>

                {isOpen && activeTask ? (
                  <div className="mt-3 border-t border-zinc-100 pt-3">
                    <TaskSubmissionForm
                      key={`${activeTask.id}-${activeTask.status}`}
                      task={activeTask}
                      shopId={shopId}
                      staffId={selectedStaffId}
                      busy={busy}
                      onSubmit={(payload) => taskAction(activeTask.id, "submit", payload)}
                    />
                  </div>
                ) : isException ? (
                  <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                    <select
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      value={reasonType}
                      onChange={(e) => setReasonType(e.target.value as typeof reasonType)}
                    >
                      {FEEDBACK_REASON_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {t(`tasks.feedbackReason.${r}`)}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      placeholder={t("tasks.staff.explanation")}
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={busy || !reasonText.trim()}
                      onClick={() =>
                        void taskAction(task.id, "exception", {
                          reason_type: reasonType,
                          reason_text: reasonText.trim(),
                        })
                      }
                      className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      {t("tasks.staff.reportException")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canWork && !assignedToOther && dbStatus === "in_progress" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openTask(task)}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {t("tasks.staff.resume")}
                      </button>
                    ) : null}
                    {canWork && !assignedToOther && (dbStatus === "pending" || dbStatus === "rejected" || dbStatus === "missed") ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openTask(task)}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {dbStatus === "pending" ? t("tasks.staff.start") : t("tasks.staff.resume")}
                      </button>
                    ) : null}
                    {canWork && assignedToOther ? (
                      <p className="text-xs text-red-600">{t("tasks.staff.failure.task_not_assigned_to_you")}</p>
                    ) : null}
                    {task.feedback_allowed && dbStatus !== "verified" && dbStatus !== "fair" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setExceptionTaskId(task.id);
                          setActiveTaskId(null);
                        }}
                        className="rounded border border-purple-300 px-3 py-1.5 text-xs font-semibold text-purple-800"
                      >
                        {t("tasks.staff.reportException")}
                      </button>
                    )}
                    {dbStatus === "submitted" && task.verifier_staff_id === selectedStaffId && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void taskAction(task.id, "verify", { decision: "accepted" })
                          }
                          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t("tasks.detail.accept")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const feedback = window.prompt(t("tasks.detail.feedbackOptional"));
                            void taskAction(task.id, "verify", {
                              decision: "fair",
                              manager_feedback: feedback?.trim() || undefined,
                            });
                          }}
                          className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t("tasks.detail.fair")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const feedback = window.prompt(t("tasks.detail.feedbackRequired"));
                            if (!feedback?.trim()) return;
                            void taskAction(task.id, "verify", {
                              decision: "rejected",
                              manager_feedback: feedback.trim(),
                            });
                          }}
                          className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t("tasks.detail.reject")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
