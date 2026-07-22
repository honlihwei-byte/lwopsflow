"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  companyName: string;
  companyId: string;
  onClose: () => void;
  onDeleted: (companyId: string) => void;
};

export function DeleteCompanyModal({
  open,
  companyName,
  companyId,
  onClose,
  onDeleted,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = confirmText === "DELETE";

  async function handleDelete() {
    if (!canConfirm) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/companies/${encodeURIComponent(companyId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Delete failed");
        return;
      }
      onDeleted(companyId);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-company-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h2 id="delete-company-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          Permanently delete company?
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          This will permanently delete <strong>{companyName}</strong>, its shops, staff, schedules,
          attendance records, subscriptions, and company users. This action cannot be undone.
        </p>
        <label className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Type <span className="font-mono font-bold">DELETE</span> to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono dark:border-zinc-600 dark:bg-zinc-900"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm || loading}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleDelete()}
          >
            {loading ? "Deleting…" : "Permanently Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
