"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  message?: string | null;
  read_at: string | null;
  created_at: string;
};

function EmployeeNotificationsInner() {
  const { t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/notifications", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { notifications?: Notification[] };
        setItems(j.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: id }),
    });
    await load();
  }

  async function markAllRead() {
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: "all" }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("employee.notifications.title")}</h1>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-sm font-semibold text-emerald-700 underline"
          >
            {t("notifications.bell.markAllRead")}
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="text-sm text-zinc-500">{t("employee.notifications.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("employee.notifications.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const text = n.message ?? n.body;
            return (
              <li
                key={n.id}
                className={[
                  "rounded-lg border p-3 text-sm",
                  n.read_at
                    ? "border-zinc-200 bg-white opacity-70 dark:border-zinc-700 dark:bg-zinc-900"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
                ].join(" ")}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t(`notifications.types.${n.type}`)}
                </p>
                <p className="font-semibold">{n.title}</p>
                {text ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">{text}</p> : null}
                <p className="mt-1 text-[11px] text-zinc-400">
                  {new Date(n.created_at).toLocaleString()}
                </p>
                {!n.read_at ? (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="mt-2 text-xs font-semibold text-emerald-700 underline"
                  >
                    {t("employee.notifications.markRead")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function EmployeeNotificationsPage() {
  return (
    <EmployeeSessionGate>
      <EmployeeNotificationsInner />
    </EmployeeSessionGate>
  );
}
