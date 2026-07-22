"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string };

export type ForgotPunchReviewItem = {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  shop_id: string;
  shop_name: string;
  request_type: string;
  request_type_label: string;
  requested_time: string;
  reason: string;
  notes: string | null;
  status: string;
  status_label: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  audit_old_json: unknown;
  audit_new_json: unknown;
};

export function ForgotPunchReviewPanel({
  shops,
  staff,
}: {
  shops: Shop[];
  staff: Staff[];
}) {
  const { t } = useI18n();
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<ForgotPunchReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status });
      if (shopId !== "__all__") params.set("shop_id", shopId);
      if (staffId !== "__all__") params.set("staff_id", staffId);
      const res = await fetch(`/api/admin/forgot-punch-requests?${params}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { items?: ForgotPunchReviewItem[]; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setItems(j.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [shopId, staffId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forgot-punch-requests/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewed_by: "admin" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Status
          <select
            className="min-w-[140px] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="__all__">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Shop
          <select
            className="min-w-[160px] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
          >
            <option value="__all__">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Staff
          <select
            className="min-w-[160px] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="__all__">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.staff_name} ({s.staff_code})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("review.loadingRequests")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600">
          No forgot punch requests match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Shop</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Requested time</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.staff_name}</div>
                    <div className="text-xs text-zinc-500">{item.staff_code}</div>
                  </td>
                  <td className="px-3 py-3">{item.shop_name}</td>
                  <td className="px-3 py-3">{item.request_type_label}</td>
                  <td className="px-3 py-3 font-mono text-xs">{item.requested_time}</td>
                  <td className="px-3 py-3">
                    <div className="capitalize">{item.reason.replace(/_/g, " ")}</div>
                    {item.notes ? (
                      <p className="mt-1 max-w-[200px] text-xs text-zinc-500">{item.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.status === "pending"
                          ? "bg-amber-100 text-amber-900"
                          : item.status === "approved"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-zinc-200 text-zinc-800"
                      }`}
                    >
                      {item.status_label}
                    </span>
                    {item.reviewed_at ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.reviewed_by ?? "admin"} · {item.reviewed_at}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {item.status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actingId === item.id}
                          onClick={() => void review(item.id, "approve")}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actingId === item.id}
                          onClick={() => void review(item.id, "reject")}
                          className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold dark:border-zinc-600"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
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
