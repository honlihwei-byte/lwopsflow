"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Row = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  recipient_name: string;
  shop_name: string | null;
  is_read: boolean;
  created_at: string;
};

function AdminNotificationsInner() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { notifications?: Row[] };
        setRows(j.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold text-zinc-900">{t("notifications.admin.title")}</h1>
      <p className="text-sm text-zinc-600">{t("notifications.admin.subtitle")}</p>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("notifications.bell.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("notifications.admin.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">{t("notifications.admin.when")}</th>
                <th className="px-3 py-2">{t("notifications.admin.recipient")}</th>
                <th className="px-3 py-2">{t("notifications.admin.type")}</th>
                <th className="px-3 py-2">{t("notifications.admin.message")}</th>
                <th className="px-3 py-2">{t("notifications.admin.read")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{r.recipient_name}</td>
                  <td className="px-3 py-2">{t(`notifications.types.${r.type}`)}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.title}</p>
                    {r.message ? <p className="text-xs text-zinc-500">{r.message}</p> : null}
                    {r.shop_name ? (
                      <p className="text-xs text-zinc-400">{r.shop_name}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_read ? t("notifications.admin.readYes") : t("notifications.admin.readNo")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminNotificationsPage() {
  return (
    <AdminSessionGate>
      <AdminNotificationsInner />
    </AdminSessionGate>
  );
}
