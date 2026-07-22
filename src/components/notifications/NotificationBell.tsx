"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type NotificationItem = {
  id: string;
  title: string;
  message?: string | null;
  body?: string | null;
  type: string;
  read_at?: string | null;
  is_read?: boolean;
  created_at: string;
  recipient_name?: string;
};

type Props = {
  mode: "employee" | "admin";
  listHref: string;
};

export function NotificationBell({ mode, listHref }: Props) {
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const apiUrl = mode === "employee" ? "/api/employee/notifications" : "/api/admin/notifications";

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}?count_only=true`, { credentials: "include" });
      if (!res.ok) return;
      const j = (await res.json()) as { unread?: number };
      setUnread(j.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [apiUrl]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}?limit=8`, { credentials: "include" });
      if (!res.ok) return;
      const j = (await res.json()) as { notifications?: NotificationItem[]; unread?: number };
      setItems(j.notifications ?? []);
      setUnread(j.unread ?? 0);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markRead(id: string) {
    if (mode !== "employee") return;
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: id }),
    });
    await loadPreview();
  }

  async function markAllRead() {
    if (mode !== "employee") return;
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: "all" }),
    });
    await loadPreview();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("notifications.bell.label")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg dark:border-zinc-600 dark:bg-zinc-900"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void loadPreview();
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-sm font-semibold">{t("notifications.bell.title")}</p>
            {mode === "employee" && unread > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-emerald-700 underline"
                onClick={() => void markAllRead()}
              >
                {t("notifications.bell.markAllRead")}
              </button>
            ) : null}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-xs text-zinc-500">{t("notifications.bell.loading")}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-zinc-500">{t("notifications.bell.empty")}</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const isRead = n.is_read ?? n.read_at != null;
                  const text = n.message ?? n.body;
                  return (
                    <li
                      key={n.id}
                      className={[
                        "border-b border-zinc-50 px-3 py-2 text-xs last:border-0 dark:border-zinc-800",
                        isRead ? "opacity-60" : "bg-emerald-50/50 dark:bg-emerald-950/20",
                      ].join(" ")}
                    >
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{n.title}</p>
                      {mode === "admin" && n.recipient_name ? (
                        <p className="text-zinc-500">{n.recipient_name}</p>
                      ) : null}
                      {text ? <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{text}</p> : null}
                      {mode === "employee" && !isRead ? (
                        <button
                          type="button"
                          className="mt-1 font-semibold text-emerald-700 underline"
                          onClick={() => void markRead(n.id)}
                        >
                          {t("notifications.bell.markRead")}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <Link
              href={listHref}
              className="text-xs font-semibold text-zinc-700 underline dark:text-zinc-300"
              onClick={() => setOpen(false)}
            >
              {t("notifications.bell.viewAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
