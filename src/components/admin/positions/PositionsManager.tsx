"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type CompanyPosition = {
  id: string;
  name: string;
  status: "active" | "archived";
  staff_count?: number;
};

function emptyForm(): { name: string } {
  return { name: "" };
}

export function PositionsManager() {
  const { t } = useI18n();
  const [positions, setPositions] = useState<CompanyPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = showArchived ? "?include_archived=1" : "";
      const res = await fetch(`/api/company/positions${qs}`, { credentials: "include" });
      const j = (await res.json()) as { error?: string; positions?: CompanyPosition[] };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setPositions(j.positions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  function startAdd() {
    setShowAdd(true);
    setEditingId(null);
    setForm(emptyForm());
    setNotice(null);
  }

  function startEdit(p: CompanyPosition) {
    setShowAdd(false);
    setEditingId(p.id);
    setForm({ name: p.name });
    setNotice(null);
  }

  function cancelForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function saveForm() {
    const name = form.name.trim();
    if (!name) {
      setError(t("positions.name"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isNew = showAdd;
      const url = isNew
        ? "/api/company/positions"
        : `/api/company/positions/${encodeURIComponent(editingId!)}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to save");
      setNotice(isNew ? t("positions.created") : t("positions.updated"));
      cancelForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function archivePosition(id: string) {
    if (!window.confirm(t("positions.confirmArchive"))) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/positions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to archive");
      setNotice(t("positions.archived"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive");
    } finally {
      setSaving(false);
    }
  }

  const formOpen = showAdd || editingId !== null;
  const activePositions = positions.filter((p) => p.status === "active");
  const archivedPositions = positions.filter((p) => p.status === "archived");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/profile" className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {t("positions.backSettings")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {t("positions.managementTitle")}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("positions.subtitle")}</p>
          </div>
          {!formOpen ? (
            <button
              type="button"
              onClick={startAdd}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {t("positions.addPosition")}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      {formOpen ? (
        <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {showAdd ? t("positions.addPosition") : t("positions.editPosition")}
          </h2>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t("positions.name")}
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={form.name}
              onChange={(e) => setForm({ name: e.target.value })}
              placeholder={t("positions.namePlaceholder")}
            />
          </label>
          <p className="text-[11px] text-zinc-500">{t("positions.jobTitleHint")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveForm()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? t("positions.saving") : t("positions.save")}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            >
              {t("positions.cancel")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">{t("positions.listTitle")}</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {t("positions.showArchived")}
          </label>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("positions.loading")}</p>
        ) : activePositions.length === 0 && archivedPositions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("positions.noPositions")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {activePositions.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{p.name}</p>
                  <p className="text-xs text-zinc-500">
                    {(p.staff_count ?? 0) > 0
                      ? t("positions.staffAssigned").replace("{count}", String(p.staff_count))
                      : t("positions.noStaffAssigned")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                  >
                    {t("positions.edit")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void archivePosition(p.id)}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    {t("positions.archive")}
                  </button>
                </div>
              </li>
            ))}
            {showArchived
              ? archivedPositions.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 bg-zinc-50 px-4 py-3 opacity-75 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-zinc-700 dark:text-zinc-300">{p.name}</p>
                      <p className="text-xs text-zinc-500">{t("positions.archivedLabel")}</p>
                    </div>
                  </li>
                ))
              : null}
          </ul>
        )}
      </section>
    </div>
  );
}
