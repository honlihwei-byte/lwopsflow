"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SetupProgress, SetupChecklistItemId } from "@/lib/setup-progress";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function SetupProgressChecklist() {
  const { t } = useI18n();
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/setup-progress", { credentials: "include" });
      const j = (await res.json()) as SetupProgress & { error?: string };
      if (res.ok) setProgress(j);
    } catch {
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function itemLabel(id: SetupChecklistItemId): string {
    return t(`setup.items.${id}`);
  }

  if (loading) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700">
        {t("setup.loading")}
      </p>
    );
  }

  if (!progress) return null;

  if (progress.percent_complete >= 100) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          {t("setup.completeTitle").replace("{percent}", String(progress.percent_complete))}
        </p>
        <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">{t("setup.completeDesc")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("setup.title")}</h2>
        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
          {t("setup.percentComplete").replace("{percent}", String(progress.percent_complete))}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-500"
          style={{ width: `${progress.percent_complete}%` }}
        />
      </div>
      <ul className="mt-4 space-y-2">
        {progress.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span
              className={
                item.done
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-400 dark:text-zinc-500"
              }
              aria-hidden="true"
            >
              {item.done ? "☑" : "□"}
            </span>
            {item.done ? (
              <span className="text-zinc-600 line-through dark:text-zinc-400">{itemLabel(item.id)}</span>
            ) : (
              <Link
                href={item.href}
                className="font-medium text-blue-700 underline dark:text-blue-300"
              >
                {itemLabel(item.id)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
