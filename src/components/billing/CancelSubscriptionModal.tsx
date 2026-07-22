"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { btnPrimary, btnSecondary } from "@/components/marketing/MarketingShell";
import { formatTemplate } from "@/lib/i18n/format-template";

type Props = {
  open: boolean;
  periodEnd: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelSubscriptionModal({
  open,
  periodEnd,
  busy,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useI18n();

  if (!open) return null;

  const dateLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString()
    : null;
  const body = dateLabel
    ? formatTemplate(t("billing.cancelModal.body"), { date: dateLabel })
    : t("billing.cancelModal.bodyNoDate");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <h2 id="cancel-subscription-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {t("billing.cancelModal.title")}
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("billing.cancelModal.noCharge")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={btnPrimary("disabled:opacity-50")}
          >
            {busy ? t("billing.cancelModal.cancelling") : t("billing.cancelModal.confirm")}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className={btnSecondary()}>
            {t("billing.cancelModal.keep")}
          </button>
        </div>
      </div>
    </div>
  );
}
