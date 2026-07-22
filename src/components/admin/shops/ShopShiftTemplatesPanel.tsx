"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";

type Template = {
  id: string;
  shop_id?: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
};

async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function ShopShiftTemplatesPanel({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("18:00");
  const [breakMin, setBreakMin] = useState(60);
  const [scope, setScope] = useState<"company" | "shop">("company");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/shift-templates`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readErr(res));
      const j = (await res.json()) as { templates?: Template[] };
      setTemplates(j.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.templates.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [shopId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function seedDefaults() {
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/shift-templates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed_defaults: true }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      await load();
      window.dispatchEvent(new CustomEvent("opsflow:templatesUpdated", { detail: { shopId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.templates.failed"));
    }
  }

  async function addTemplate() {
    if (!name.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/shift-templates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_scope: scope,
          name: name.trim(),
          start_time: start,
          end_time: end,
          break_minutes: breakMin,
        }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      setName("");
      await load();
      window.dispatchEvent(new CustomEvent("opsflow:templatesUpdated", { detail: { shopId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.templates.failed"));
    }
  }

  async function removeTemplate(id: string) {
    if (!confirm(t("shops.editForm.templates.confirmDelete"))) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/shift-templates/${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(await readErr(res));
      await load();
      window.dispatchEvent(new CustomEvent("opsflow:templatesUpdated", { detail: { shopId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.templates.failed"));
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.templates.title")}
          <HelpInfoIcon helpKey="shiftTemplate" />
        </p>
        {templates.length === 0 ? (
          <button
            type="button"
            onClick={() => void seedDefaults()}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold dark:border-zinc-600"
          >
            {t("shops.editForm.templates.addDefaults")}
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-xs text-zinc-500">{t("shops.editForm.templates.loading")}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {templates.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-950"
            >
              <span>
                <span className="font-medium">{tpl.name}</span>{" "}
                <span className="font-mono text-xs text-zinc-500">
                  {tpl.start_time}–{tpl.end_time}
                  {tpl.break_minutes > 0
                    ? ` · ${tpl.break_minutes}${t("shops.editForm.templates.minuteBreak")}`
                    : ""}
                </span>
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {tpl.shop_id ? t("shops.editForm.templates.scopeShop") : t("shops.editForm.templates.scopeCompany")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void removeTemplate(tpl.id)}
                className="text-xs text-red-600 underline"
              >
                {t("shops.editForm.templates.delete")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-500">{t("shops.editForm.templates.noTemplates")}</p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
        <input
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          placeholder={t("shops.editForm.templates.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "company" | "shop")}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
        >
          <option value="company">{t("shops.editForm.templates.scopeCompanyWide")}</option>
          <option value="shop">{t("shops.editForm.templates.scopeThisShop")}</option>
        </select>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950" />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950" />
        <input type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 0)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950" />
        <button type="button" onClick={() => void addTemplate()} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900">
          {t("shops.editForm.templates.add")}
        </button>
      </div>
    </div>
  );
}

export type { Template as ShopShiftTemplate };
