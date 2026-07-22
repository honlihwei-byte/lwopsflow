"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string };

export type SelfieReviewItem = {
  id: string;
  shop_id: string;
  shop_name: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  action_label: string;
  recorded_at: string;
  verification_label: string;
  risk_level: string;
  risk_score: number;
  review_required: boolean;
  buddy_punch_flag: boolean;
  selfie_url: string | null;
};

export function SelfieReviewPanel({
  shops,
  staff,
}: {
  shops: Shop[];
  staff: Staff[];
}) {
  const { t } = useI18n();
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [day, setDay] = useState(malaysiaDateYmd(new Date()));
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [items, setItems] = useState<SelfieReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (shopId !== "__all__") params.set("shop_id", shopId);
      if (staffId !== "__all__") params.set("staff_id", staffId);
      params.set("day", day);
      if (highRiskOnly) params.set("high_risk", "true");
      const res = await fetch(`/api/admin/selfie-review?${params}`, { credentials: "include" });
      const j = (await res.json()) as { items?: SelfieReviewItem[]; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setItems(j.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [shopId, staffId, day, highRiskOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Date
          <input
            type="date"
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
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
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={highRiskOnly}
            onChange={(e) => setHighRiskOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          High risk only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-600"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-zinc-500">{t("review.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No selfie proof punches for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Staff</th>
                <th className="px-3 py-2 font-medium">Shop</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Selfie</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 whitespace-nowrap">{row.recorded_at}</td>
                  <td className="px-3 py-2">
                    {row.staff_name}
                    <span className="ml-1 text-xs text-zinc-500">{row.staff_code}</span>
                  </td>
                  <td className="px-3 py-2">{row.shop_name}</td>
                  <td className="px-3 py-2">{row.action_label}</td>
                  <td className="px-3 py-2">
                    {row.selfie_url ? (
                      <button
                        type="button"
                        className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                        onClick={() => setViewUrl(row.selfie_url)}
                      >
                        Selfie Proof
                      </button>
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

      {viewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewUrl(null)}
        >
          <div className="max-h-[90vh] max-w-lg overflow-auto rounded-lg bg-white p-2 dark:bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewUrl} alt="Selfie proof" className="max-h-[80vh] w-full object-contain" />
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-zinc-300 py-2 text-sm dark:border-zinc-600"
              onClick={() => setViewUrl(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
