"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateEmployeeStatus } from "@/lib/i18n/employee-translate";
import { PushOnboardingPrompt } from "@/components/notifications/PushOnboardingPrompt";

type DashboardData = {
  clock_context: {
    resolution: string;
    scheduled_shift: {
      shop_name: string;
      start_time: string;
      end_time: string;
      is_off_day: boolean;
    } | null;
    selected_shop_id: string | null;
    assigned_shops: Array<{ id: string; name: string }>;
    can_clock: boolean;
    block_message: string | null;
  };
  today_status: { status?: string; status_label?: string } | null;
  pending_tasks: number;
  unread_notifications: number;
  operations_center: {
    total_unread: number;
    total_items: number;
    recent: Array<{
      id: string;
      title: string;
      content_type: string;
      is_pending: boolean;
    }>;
  };
};

export function EmployeeDashboardClient() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/dashboard", { credentials: "include" });
      if (res.ok) setData((await res.json()) as DashboardData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-base text-zinc-500">{t("employee.dashboard.loading")}</p>;
  }

  if (!data) {
    return <p className="text-base text-red-600">{t("employee.dashboard.loadFailed")}</p>;
  }

  const ctx = data.clock_context;
  const shift = ctx.scheduled_shift;
  const shopName =
    shift?.shop_name ||
    ctx.assigned_shops.find((s) => s.id === ctx.selected_shop_id)?.name ||
    "";

  const clockHref = ctx.selected_shop_id
    ? `/employee/clock?shop_id=${encodeURIComponent(ctx.selected_shop_id)}`
    : "/employee/clock";

  return (
    <div className="space-y-3">
      <PushOnboardingPrompt />

      {ctx.block_message === "no_shop_assigned" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("employee.dashboard.noShopAssigned")}
        </p>
      ) : ctx.can_clock ? (
        <Link
          href={clockHref}
          className="block rounded-xl bg-emerald-600 py-4 text-center text-lg font-semibold text-white shadow-sm active:scale-[0.99]"
        >
          {t("employee.dashboard.clockIn")}
        </Link>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {t("employee.dashboard.todayShift")}
        </h2>
        {shift ? (
          shift.is_off_day ? (
            <p className="mt-1 text-base text-zinc-600">{t("employee.dashboard.offDay")}</p>
          ) : (
            <p className="mt-1 text-base text-zinc-800 dark:text-zinc-200">
              {shift.shop_name} · {shift.start_time} – {shift.end_time}
            </p>
          )
        ) : (
          <p className="mt-1 text-base text-zinc-500">{t("employee.dashboard.noShift")}</p>
        )}
        {shopName && !shift ? (
          <p className="mt-1 text-sm text-zinc-500">
            {t("employee.dashboard.assignedShop")}: {shopName}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/employee/tasks"
          className="rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
        >
          <p className="text-xs font-medium text-zinc-500">{t("employee.dashboard.pendingTasks")}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{data.pending_tasks}</p>
        </Link>
        <Link
          href="/employee/notifications"
          className="rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
        >
          <p className="text-xs font-medium text-zinc-500">
            {t("employee.dashboard.unreadNotifications")}
          </p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {data.unread_notifications}
          </p>
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {t("operationsCenter.employee.sectionTitle")}
            </h2>
            <p className="text-xs text-zinc-500">{t("operationsCenter.employee.sectionSubtitle")}</p>
          </div>
          <Link href="/employee/operations-center" className="text-xs font-semibold text-violet-600">
            {t("operationsCenter.employee.viewAll")}
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
            <p className="text-[10px] uppercase text-zinc-500">{t("operationsCenter.employee.unreadCount")}</p>
            <p className="text-lg font-bold">{data.operations_center?.total_unread ?? 0}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
            <p className="text-[10px] uppercase text-zinc-500">{t("operationsCenter.employee.totalItems")}</p>
            <p className="text-lg font-bold">{data.operations_center?.total_items ?? 0}</p>
          </div>
        </div>
        {(data.operations_center?.recent ?? []).length > 0 ? (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.operations_center.recent.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/employee/operations-center/${item.id}`}
                  className="flex items-center justify-between gap-2 py-2 active:bg-zinc-50 dark:active:bg-zinc-800"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {item.title}
                  </span>
                  {item.is_pending ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {t("operationsCenter.employee.unreadBadge")}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">{t("operationsCenter.employee.empty")}</p>
        )}
      </section>

      {data.today_status ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t("employee.dashboard.todayStatus")}
          </h2>
          <p className="mt-1 text-base">
            {translateEmployeeStatus(t, data.today_status.status ?? data.today_status.status_label)}
          </p>
        </section>
      ) : null}
    </div>
  );
}
