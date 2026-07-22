"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  open: boolean;
  shopId: string;
  staffId: string;
  onContinue: () => void;
  onCancel: () => void;
};

export function ClockOutTasksWarning({ open, shopId, staffId, onContinue, onCancel }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  const tasksHref = `/shop/${encodeURIComponent(shopId)}/tasks?staff_id=${encodeURIComponent(staffId)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clock-out-tasks-title"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-4 shadow-lg dark:border-amber-900 dark:bg-zinc-900">
        <h2 id="clock-out-tasks-title" className="text-base font-semibold text-amber-950 dark:text-amber-100">
          {t("clock.tasks.clockOutWarningTitle")}
        </h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {t("clock.tasks.clockOutWarningBody")}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            href={tasksHref}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
          >
            {t("clock.tasks.viewTasks")}
          </Link>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-600"
          >
            {t("clock.tasks.continueClockOut")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-zinc-500"
          >
            {t("clock.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
