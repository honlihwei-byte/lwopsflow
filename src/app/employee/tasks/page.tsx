"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { TaskStatusBadge } from "@/components/admin/tasks/TaskStatusBadge";
import type { RetailTaskListItem } from "@/lib/retail-tasks/types";

function EmployeeTasksInner() {
  const { t } = useI18n();
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
  const [shopId, setShopId] = useState("");
  const [tasks, setTasks] = useState<RetailTaskListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadShops = useCallback(async () => {
    const res = await fetch("/api/employee/clock-context", { credentials: "include" });
    if (res.ok) {
      const j = (await res.json()) as { assigned_shops?: Array<{ id: string; name: string }> };
      const list = j.assigned_shops ?? [];
      setShops(list);
      if (!shopId && list[0]) setShopId(list[0].id);
    }
  }, [shopId]);

  const loadTasks = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ shop_id: shopId });
      const res = await fetch(`/api/employee/tasks?${qs}`, { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { tasks?: RetailTaskListItem[] };
        setTasks(j.tasks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("employee.tasks.title")}</h1>
      <p className="text-xs text-zinc-500">{t("employee.tasks.historyHint")}</p>
      {shops.length > 1 ? (
        <label className="block text-sm">
          {t("employee.tasks.selectShop")}
          <select
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {loading ? (
        <p className="text-sm text-zinc-500">{t("employee.tasks.loading")}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("employee.tasks.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm">{task.title}</p>
                <TaskStatusBadge status={task.status} />
              </div>
              {task.due_time ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {t("employee.tasks.due").replace("{time}", task.due_time)}
                </p>
              ) : null}
              {task.latest_review ? (
                <div className="mt-2 rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
                  <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {t(`tasks.review.${task.latest_review.decision}`)}
                    {" · "}
                    {t("employee.tasks.awardedScore").replace(
                      "{score}",
                      String(task.latest_review.awarded_score),
                    )}
                  </p>
                  {task.latest_review.manager_feedback ? (
                    <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                      {t("employee.tasks.managerFeedback")}: {task.latest_review.manager_feedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {shopId ? (
                <a
                  href={`/shop/${encodeURIComponent(shopId)}/tasks`}
                  className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline"
                >
                  {t("employee.tasks.openDetails")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EmployeeTasksPage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="my_tasks">
        <EmployeeTasksInner />
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
