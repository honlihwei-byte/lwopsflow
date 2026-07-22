"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string };

export type RiskReviewItem = {
  id: string;
  shop_id: string;
  shop_name: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  action_label: string;
  recorded_at: string;
  risk_score: number;
  risk_level: string;
  risk_reasons: string[];
  device_trust_status: string | null;
  buddy_punch_flag: boolean;
  review_required: boolean;
  verification_label: string;
  gps_status_label: string;
  photo_url: string | null;
  punch_device_id: string | null;
  punch_browser_info: string | null;
  audit_notes: string | null;
};

function riskLevelClass(level: string): string {
  if (level === "high") return "text-rose-700 dark:text-rose-300";
  if (level === "medium") return "text-amber-700 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-300";
}

export function RiskReviewPanel({ shops, staff }: { shops: Shop[]; staff: Staff[] }) {
  const { t } = useI18n();
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [todayOnly, setTodayOnly] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [items, setItems] = useState<RiskReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (shopId !== "__all__") params.set("shop_id", shopId);
      if (staffId !== "__all__") params.set("staff_id", staffId);
      params.set("today", todayOnly ? "true" : "false");
      params.set("review_required", reviewOnly ? "true" : "false");
      params.set("day", malaysiaDateYmd(new Date()));
      const res = await fetch(`/api/admin/risk-review?${params}`, { credentials: "include" });
      const j = (await res.json()) as { items?: RiskReviewItem[]; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setItems(j.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [shopId, staffId, todayOnly, reviewOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={todayOnly}
            onChange={(e) => setTodayOnly(e.target.checked)}
          />
          Today only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
          />
          Review required only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-600"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-zinc-500">{t("review.loadingRisk")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No flagged punches match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {item.staff_name}{" "}
                    <span className="text-sm font-normal text-zinc-500">({item.staff_code})</span>
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {item.shop_name} · {item.action_label} · {item.recorded_at}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${riskLevelClass(item.risk_level)}`}>
                    Risk {item.risk_score} — {item.risk_level}
                    {item.review_required ? (
                      <span className="ml-2 text-orange-700 dark:text-orange-300">Review required</span>
                    ) : null}
                  </p>
                  {item.risk_reasons.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">
                      {item.risk_reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    {item.verification_label} · {item.gps_status_label}
                  </p>
                  {item.punch_device_id ? (
                    <p className="mt-1 break-all text-xs text-zinc-500">
                      Device: {item.punch_device_id.slice(0, 36)}
                      {item.device_trust_status ? ` (${item.device_trust_status})` : ""}
                    </p>
                  ) : null}
                  {item.punch_browser_info ? (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{item.punch_browser_info}</p>
                  ) : null}
                </div>
                {item.photo_url ? (
                  <a
                    href={item.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photo_url}
                      alt={`Proof ${item.staff_name}`}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32 object-cover"
                    />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
