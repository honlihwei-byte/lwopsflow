"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string };

export type PhotoProofReviewItem = {
  id: string;
  shop_id: string;
  shop_name: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  action_label: string;
  recorded_at: string;
  verification_label: string;
  gps_status: string;
  gps_status_label: string;
  review_required: boolean;
  photo_url: string | null;
};

export function PhotoProofReviewPanel({
  shops,
  staff,
}: {
  shops: Shop[];
  staff: Staff[];
}) {
  const { t } = useI18n();
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [todayOnly, setTodayOnly] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(true);
  const [items, setItems] = useState<PhotoProofReviewItem[]>([]);
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
      const res = await fetch(`/api/admin/photo-proof?${params}`, { credentials: "include" });
      const j = (await res.json()) as { items?: PhotoProofReviewItem[]; error?: string };
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
          Today
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
          />
          Review required
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white"
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
        <p className="text-sm text-zinc-500">{t("review.loadingPhotoProof")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No photo proof punches match these filters.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo_url}
                    alt={`Photo proof ${item.staff_name}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                    No image
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-900 dark:bg-violet-950/60 dark:text-violet-100">
                    {item.verification_label}
                  </span>
                  {item.review_required ? (
                    <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-900 dark:bg-orange-950/60 dark:text-orange-100">
                      Review Required
                    </span>
                  ) : null}
                </div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{item.staff_name}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {item.shop_name} · {item.staff_code}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {item.action_label} · {item.recorded_at}
                </p>
                <p className="text-xs text-zinc-500">{item.gps_status}</p>
                {item.photo_url ? (
                  <a
                    href={item.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-semibold text-violet-700 underline dark:text-violet-300"
                  >
                    View full image
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
