"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import type { SelfieProofMode } from "@/lib/selfie-proof-policy";

type SelfieSettings = {
  selfie_proof_mode: SelfieProofMode;
  selfie_proof_random_percent: 0 | 5 | 10 | 20;
};

export function AntiBuddySettingsForm() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SelfieSettings>({
    selfie_proof_mode: "off",
    selfie_proof_random_percent: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError, showWarning, dismiss } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/anti-buddy-settings", { credentials: "include" });
      const j = (await res.json()) as {
        settings?: SelfieSettings & {
          random_selfie_enabled?: boolean;
          random_selfie_percent?: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || t("antiBuddy.failedLoadGeneric"));
      if (j.settings) {
        let mode = j.settings.selfie_proof_mode ?? "off";
        if (mode === "off" && j.settings.random_selfie_enabled) mode = "random";
        setSettings({
          selfie_proof_mode: mode,
          selfie_proof_random_percent:
            j.settings.selfie_proof_random_percent ??
            (j.settings.random_selfie_percent as SelfieSettings["selfie_proof_random_percent"]) ??
            10,
        });
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : t("antiBuddy.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [showError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        selfie_proof_mode: settings.selfie_proof_mode,
        selfie_proof_random_percent:
          settings.selfie_proof_mode === "random" ? settings.selfie_proof_random_percent : 0,
      };
      const res = await fetch("/api/company/anti-buddy-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        settings?: SelfieSettings;
        error?: string;
        details?: string;
        hint?: string;
        message?: string;
        warning?: string;
      };
      if (!res.ok) {
        const parts = [j.error, j.details, j.hint].filter(Boolean).join(" — ");
        throw new Error(parts || t("antiBuddy.failedSaveGeneric"));
      }
      if (j.settings) {
        setSettings({
          selfie_proof_mode: j.settings.selfie_proof_mode,
          selfie_proof_random_percent: j.settings.selfie_proof_random_percent,
        });
      }
      if (j.warning === "migration_required") {
        showWarning(t("antiBuddy.savedLimited"));
      } else {
        showSuccess(t("antiBuddy.saved"));
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : t("antiBuddy.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">{t("antiBuddy.loading")}</p>;
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("antiBuddy.title")}</h3>
        <p className="mt-1 text-xs text-zinc-500">{t("antiBuddy.desc")}</p>
        <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t("antiBuddy.mode")}
          <select
            className="max-w-[20rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={settings.selfie_proof_mode}
            onChange={(e) => {
              const mode = e.target.value as SelfieProofMode;
              setSettings((s) => ({
                ...s,
                selfie_proof_mode: mode,
                selfie_proof_random_percent:
                  mode === "random" && s.selfie_proof_random_percent === 0
                    ? 10
                    : s.selfie_proof_random_percent,
              }));
            }}
          >
            <option value="off">{t("antiBuddy.modeOff")}</option>
            <option value="always">{t("antiBuddy.modeAlways")}</option>
            <option value="risk">{t("antiBuddy.modeRisk")}</option>
            <option value="random">{t("antiBuddy.modeRandom")}</option>
          </select>
        </label>
        {settings.selfie_proof_mode === "random" ? (
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("antiBuddy.randomPercent")}
            <select
              className="max-w-[8rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={settings.selfie_proof_random_percent}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  selfie_proof_random_percent: Number(e.target.value) as SelfieSettings["selfie_proof_random_percent"],
                }))
              }
            >
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={20}>20%</option>
            </select>
          </label>
        ) : null}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? t("antiBuddy.saving") : t("antiBuddy.save")}
          </button>
        </div>
      </div>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={dismiss}
      />
    </>
  );
}
