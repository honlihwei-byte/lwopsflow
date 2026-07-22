"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShopAntiBuddySettings } from "@/lib/shop-anti-buddy";
import {
  applySecurityToggles,
  securityTogglesFromShop,
  type ShopSecurityToggles,
} from "@/lib/shop-security-settings";
import {
  DEFAULT_SHOP_SELFIE_FREQUENCY,
  SHOP_SELFIE_FREQUENCY_OPTIONS,
  type ShopSelfieFrequency,
} from "@/lib/shop-selfie-frequency";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  shopId: string;
  disabled?: boolean;
};

export function ShopSecuritySettingsPanel({ shopId, disabled }: Props) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ShopAntiBuddySettings | null>(null);
  const [toggles, setToggles] = useState<ShopSecurityToggles | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError, dismiss } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/anti-buddy-settings`, {
        credentials: "include",
      });
      const j = (await res.json()) as { settings?: ShopAntiBuddySettings; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load security settings");
      if (j.settings) {
        setSettings(j.settings);
        setToggles(securityTogglesFromShop(j.settings, j.settings.security_weak_gps_alert));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setLoadError(msg);
      showError(msg);
      setSettings(null);
      setToggles(null);
    } finally {
      setLoading(false);
    }
  }, [shopId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!toggles) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/anti-buddy-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toggles),
      });
      const j = (await res.json()) as {
        settings?: ShopAntiBuddySettings;
        error?: string;
        details?: string;
        hint?: string;
      };
      if (!res.ok) {
        const parts = [j.error, j.details, j.hint].filter(Boolean).join(" — ");
        throw new Error(parts || "Failed to save");
      }
      if (j.settings) {
        setSettings(j.settings);
        setToggles(securityTogglesFromShop(j.settings, j.settings.security_weak_gps_alert));
      }
      showSuccess(t("shops.detail.securitySaved"));
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to save security settings");
    } finally {
      setSaving(false);
    }
  }

  function applyToggles(next: ShopSecurityToggles) {
    setToggles(next);
    if (settings) {
      setSettings(applySecurityToggles(settings, next));
    }
  }

  function setToggle<K extends keyof ShopSecurityToggles>(key: K, value: ShopSecurityToggles[K]) {
    if (!toggles) return;
    let next: ShopSecurityToggles = { ...toggles, [key]: value };
    if (key === "enable_selfie_verification" && value === true && next.selfie_frequency === "disabled") {
      next = { ...next, selfie_frequency: DEFAULT_SHOP_SELFIE_FREQUENCY };
    }
    if (key === "enable_selfie_verification" && value === false) {
      next = { ...next, selfie_frequency: "disabled" };
    }
    applyToggles(next);
  }

  const items = useMemo(
    (): {
      key: keyof Omit<ShopSecurityToggles, "selfie_frequency">;
      labelKey: string;
      descKey: string;
    }[] => [
      {
        key: "enable_selfie_verification",
        labelKey: "shops.detail.enableSelfieVerification",
        descKey: "shops.detail.enableSelfieVerificationDesc",
      },
      {
        key: "enable_new_device_review",
        labelKey: "shops.detail.enableNewDeviceReview",
        descKey: "shops.detail.enableNewDeviceReviewDesc",
      },
      {
        key: "enable_weak_gps_detection",
        labelKey: "shops.detail.enableWeakGpsDetection",
        descKey: "shops.detail.enableWeakGpsDetectionDesc",
      },
      {
        key: "enable_buddy_punch_detection",
        labelKey: "shops.detail.enableBuddyPunchDetection",
        descKey: "shops.detail.enableBuddyPunchDetectionDesc",
      },
    ],
    [],
  );

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("shops.detail.loadingSecurity")}</p>
    );
  }

  if (!toggles) {
    return loadError ? <p className="text-sm text-red-600">{loadError}</p> : null;
  }

  return (
    <>
      <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <h3 className="flex items-center text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("shops.detail.securityTitle")}
          <HelpInfoIcon helpKey="antiBuddyProtection" />
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t("shops.detail.securityDesc")}</p>

        <fieldset className="mt-4 space-y-3" disabled={disabled || saving}>
          {items.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={toggles[item.key]}
                onChange={(e) => setToggle(item.key, e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {t(item.labelKey)}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">{t(item.descKey)}</span>
              </span>
            </label>
          ))}

          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {t("shops.detail.selfieRequirement")}
            </label>
            <p className="mt-0.5 text-xs text-zinc-500">{t("shops.detail.selfieRequirementDesc")}</p>
            <select
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              disabled={!toggles.enable_selfie_verification}
              value={toggles.selfie_frequency}
              onChange={(e) =>
                setToggle("selfie_frequency", e.target.value as ShopSelfieFrequency)
              }
            >
              {SHOP_SELFIE_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`shops.detail.selfieFrequency.${opt.value}`)}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div className="mt-4">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void save()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? t("shops.detail.savingSecurity") : t("shops.detail.saveSecuritySettings")}
          </button>
        </div>
      </section>
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={dismiss}
      />
    </>
  );
}
