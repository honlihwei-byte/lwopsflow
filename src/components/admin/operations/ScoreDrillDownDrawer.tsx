"use client";

import { useEffect, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function ScoreDrillDownDrawer({
  open,
  title,
  subtitle,
  loading,
  error,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t("drilldown.close")}
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-zinc-900 sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-drilldown-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 id="score-drilldown-title" className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t("drilldown.close")}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500">{t("drilldown.loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            children
          )}
        </div>
      </aside>
    </div>
  );
}

export function ScoreGrid({ items }: { items: Array<{ label: string; display: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
        >
          <p className="text-[11px] font-medium text-zinc-500">{item.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {item.display}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ScoreDeltaList({
  deltas,
  labelForKey,
}: {
  deltas: Array<{ key: string; points: number; count: number }>;
  labelForKey: (key: string, count: number) => string;
}) {
  if (deltas.length === 0) {
    return <p className="text-sm text-zinc-500">—</p>;
  }
  return (
    <ul className="space-y-1.5">
      {deltas.map((d) => (
        <li
          key={`${d.key}-${d.points}`}
          className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/50"
        >
          <span className="text-zinc-700 dark:text-zinc-300">{labelForKey(d.key, d.count)}</span>
          <span
            className={`font-semibold tabular-nums ${d.points >= 0 ? "text-emerald-700" : "text-red-700"}`}
          >
            {d.points >= 0 ? "+" : ""}
            {d.points}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IncidentTimeline({
  incidents,
  labelForKey,
}: {
  incidents: Array<{ at: string; date_ymd: string; label_key: string; detail?: string; shop_name?: string }>;
  labelForKey: (key: string) => string;
}) {
  if (incidents.length === 0) {
    return <p className="text-sm text-zinc-500">—</p>;
  }
  return (
    <ul className="space-y-2">
      {incidents.map((inc, i) => (
        <li
          key={`${inc.at}-${inc.label_key}-${i}`}
          className="rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{labelForKey(inc.label_key)}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {inc.date_ymd}
            {inc.shop_name ? ` · ${inc.shop_name}` : ""}
            {inc.detail ? ` · ${inc.detail}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function FactorGrid({
  factors,
  labelForKey,
}: {
  factors: Array<{ key: string; count: number }>;
  labelForKey: (key: string, count: number) => string;
}) {
  const nonZero = factors.filter((f) => f.count > 0);
  if (nonZero.length === 0) {
    return <p className="text-sm text-zinc-500">—</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {nonZero.map((f) => (
        <div
          key={f.key}
          className="rounded-lg border border-zinc-100 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-[11px] text-zinc-500">{labelForKey(f.key, f.count)}</p>
          <p className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{f.count}</p>
        </div>
      ))}
    </div>
  );
}
