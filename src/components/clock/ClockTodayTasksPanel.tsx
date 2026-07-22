"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { TaskStatusBadge } from "@/components/admin/tasks/TaskStatusBadge";
import {
  countUnfinishedClockTasks,
  groupClockTasks,
  type ClockTaskSection,
} from "@/lib/retail-tasks/clock-task-grouping";
import { isStaffWorkableStatus } from "@/lib/retail-tasks/task-permissions";
import type { RetailTaskListItem, TaskStatus } from "@/lib/retail-tasks/types";

const SECTION_ORDER: ClockTaskSection[] = [
  "overdue",
  "due_soon",
  "in_progress",
  "pending",
];

type Props = {
  shopId: string;
  shopName: string;
  staffId: string;
  visible: boolean;
  /** Bump after punch success to reload without blocking punch UI. */
  refreshKey?: number;
  onUnfinishedCount?: (count: number) => void;
};

export function ClockTodayTasksPanel({
  shopId,
  shopName,
  staffId,
  visible,
  refreshKey = 0,
  onUnfinishedCount,
}: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<RetailTaskListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffId || !visible) return;
    setLoading(true);
    setFetchError(null);
    try {
      const qs = new URLSearchParams({ staff_id: staffId, context: "clock" });
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/retail-tasks?${qs}`,
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { tasks?: RetailTaskListItem[] };
      setTasks(j.tasks ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : t("clock.tasks.loadFailed"));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [shopId, staffId, visible, t]);

  useEffect(() => {
    if (!visible || !staffId) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, visible, staffId, refreshKey]);

  useEffect(() => {
    onUnfinishedCount?.(countUnfinishedClockTasks(tasks));
  }, [tasks, onUnfinishedCount]);

  const groups = useMemo(() => groupClockTasks(tasks), [tasks]);
  const hasTasks = SECTION_ORDER.some((key) => groups[key].length > 0);

  const tasksHref = `/shop/${encodeURIComponent(shopId)}/tasks?staff_id=${encodeURIComponent(staffId)}`;

  if (!visible || !staffId) return null;

  function actionLabel(task: RetailTaskListItem): string {
    if (task.status === "in_progress") return t("tasks.staff.resume");
    if (task.status === "pending" || task.status === "rejected") return t("tasks.staff.start");
    return t("clock.tasks.view");
  }

  function canActOnTask(task: RetailTaskListItem): boolean {
    if (!isStaffWorkableStatus(task.status)) return false;
    if (task.assigned_staff_id && task.assigned_staff_id !== staffId) return false;
    return true;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("clock.tasks.title")}
          </p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("clock.tasks.atShop").replace("{shop}", shopName)}
          </p>
        </div>
        <Link
          href={tasksHref}
          className="text-xs font-semibold text-emerald-700 underline dark:text-emerald-400"
        >
          {t("clock.tasks.viewAll")}
        </Link>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">{t("tasks.loading")}</p>
      ) : fetchError ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          {t("clock.tasks.loadFailed")}
        </p>
      ) : !hasTasks ? (
        <p className="mt-3 text-sm text-zinc-500">{t("clock.tasks.empty")}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {SECTION_ORDER.map((section) =>
            groups[section].length === 0 ? null : (
              <div key={section}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {t(`clock.tasks.section.${section}`)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {groups[section].map((task) => {
                    const displayStatus = (task.display_status ?? task.status) as TaskStatus;
                    return (
                      <li
                        key={task.id}
                        className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                              {task.title}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {task.due_time ? task.due_time.slice(0, 5) : t("clock.tasks.endOfDay")}
                              {" · "}
                              {t(`tasks.priority.${task.priority}` as "tasks.priority.normal")}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                              {task.checklist_items.length > 0 ? (
                                <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 dark:bg-zinc-800">
                                  {t("clock.tasks.checklist")}
                                </span>
                              ) : null}
                              {task.photo_required || task.min_photos > 0 ? (
                                <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 dark:bg-zinc-800">
                                  {t("clock.tasks.photo")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <TaskStatusBadge status={displayStatus} />
                        </div>
                        <Link
                          href={tasksHref}
                          className={`mt-2 inline-block rounded px-3 py-1.5 text-xs font-semibold text-white ${
                            canActOnTask(task)
                              ? "bg-emerald-600"
                              : "bg-zinc-500"
                          }`}
                        >
                          {actionLabel(task)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
