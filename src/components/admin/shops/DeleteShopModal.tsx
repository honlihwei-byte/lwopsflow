"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  open: boolean;
  shopName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const CONFIRM_TEXT = "DELETE";

export function DeleteShopModal({ open, shopName, busy, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  if (!open) return null;

  const canConfirm = typed.trim() === CONFIRM_TEXT && !busy;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-shop-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h2 id="delete-shop-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {t("shops.editForm.deleteModal.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.deleteModal.bodyPrefix")}{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{shopName}</span>{" "}
          {t("shops.editForm.deleteModal.bodyAfter")}
        </p>
        <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t("shops.editForm.deleteModal.typeConfirm")}{" "}
          <span className="font-mono font-semibold">{CONFIRM_TEXT}</span>{" "}
          {t("shops.editForm.deleteModal.toConfirm")}
          <input
            type="text"
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_TEXT}
            disabled={busy}
          />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600 disabled:opacity-50"
          >
            {t("shops.editForm.deleteModal.cancel")}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t("shops.editForm.deleteModal.deleting") : t("shops.editForm.deleteModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
