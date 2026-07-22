"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  ATTENDANCE_VERIFICATION_LABELS,
  type AttendanceVerificationMode,
  type ShopAntiBuddySettings,
  shopVerificationIncludesSelfie,
} from "@/lib/shop-anti-buddy";
import type { SelfieProofMode } from "@/lib/selfie-proof-policy";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";

const VERIFICATION_MODES: AttendanceVerificationMode[] = [
  "gps_only",
  "gps_selfie",
  "gps_location_proof",
  "gps_selfie_location_proof",
];

type Props = {
  shopId: string;
  disabled?: boolean;
};

export function ShopAntiBuddySettingsPanel({ shopId, disabled }: Props) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ShopAntiBuddySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/anti-buddy-settings`, {
        credentials: "include",
      });
      const j = (await res.json()) as { settings?: ShopAntiBuddySettings; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load shop settings");
      setSettings(j.settings ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/anti-buddy-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const j = (await res.json()) as { settings?: ShopAntiBuddySettings; error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to save");
      if (j.settings) setSettings(j.settings);
      setMessage("Anti Buddy settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("review.loadingAntiBuddy")}</p>
    );
  }

  if (!settings) {
    return error ? <p className="text-sm text-red-600">{error}</p> : null;
  }

  const showSelfiePolicy = shopVerificationIncludesSelfie(settings.attendance_verification_mode);
  const selfieModeValue = settings.selfie_proof_mode ?? "inherit";

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <h3 className="flex items-center text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Anti Buddy Punch Protection
        <HelpInfoIcon helpKey="antiBuddyProtection" />
      </h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Shop-specific attendance verification and risk controls. Company-wide defaults apply when
        selfie policy is set to inherit.
      </p>

      <fieldset className="mt-4 space-y-2" disabled={disabled || saving}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Attendance verification mode
        </legend>
        {VERIFICATION_MODES.map((mode) => (
          <label key={mode} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name={`verification-${shopId}`}
              className="mt-0.5"
              checked={settings.attendance_verification_mode === mode}
              onChange={() =>
                setSettings((s) => (s ? { ...s, attendance_verification_mode: mode } : s))
              }
            />
            <span>{ATTENDANCE_VERIFICATION_LABELS[mode]}</span>
          </label>
        ))}
      </fieldset>

      {showSelfiePolicy ? (
        <div className="mt-4 space-y-2 border-t border-amber-200/80 pt-4 dark:border-amber-900/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Selfie proof policy (this shop)
          </p>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            When to require front-camera selfie
            <select
              className="max-w-[16rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={selfieModeValue}
              disabled={disabled || saving}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        selfie_proof_mode:
                          v === "inherit" ? null : (v as SelfieProofMode),
                      }
                    : s,
                );
              }}
            >
              <option value="inherit">Inherit company setting</option>
              <option value="off">Off</option>
              <option value="always">Always required</option>
              <option value="risk">New device / high risk only</option>
              <option value="random">Random check</option>
            </select>
          </label>
          {settings.selfie_proof_mode === "random" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Random check %
              <select
                className="max-w-[8rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                value={settings.selfie_proof_random_percent ?? 10}
                disabled={disabled || saving}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          selfie_proof_random_percent: Number(e.target.value) as
                            | 5
                            | 10
                            | 20,
                        }
                      : s,
                  )
                }
              >
                <option value={5}>5%</option>
                <option value={10}>10%</option>
                <option value={20}>20%</option>
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <fieldset className="mt-4 space-y-2 border-t border-amber-200/80 pt-4 dark:border-amber-900/50" disabled={disabled || saving}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Risk controls
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.anti_buddy_detect_new_device}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, anti_buddy_detect_new_device: e.target.checked } : s,
              )
            }
          />
          Detect new device
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.anti_buddy_detect_device_mismatch}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, anti_buddy_detect_device_mismatch: e.target.checked } : s,
              )
            }
          />
          Detect device mismatch (clock-in vs clock-out device)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.anti_buddy_detect_shared_device}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, anti_buddy_detect_shared_device: e.target.checked } : s,
              )
            }
          />
          Detect multiple staff using same device
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.anti_buddy_flag_rapid_punches}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, anti_buddy_flag_rapid_punches: e.target.checked } : s,
              )
            }
          />
          Flag rapid consecutive punches
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.anti_buddy_require_review_high_risk}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, anti_buddy_require_review_high_risk: e.target.checked } : s,
              )
            }
          />
          Require review for high-risk punches
        </label>
      </fieldset>

      <div className="mt-4 border-t border-amber-200/80 pt-4 dark:border-amber-900/50">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">GPS</p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          GPS verification uses the shop coordinates and GPS points above. Enable{" "}
          <strong>Indoor Confidence Mode</strong> for weak-signal sites. Location proof (rear camera)
          only appears when this shop&apos;s mode includes Location Proof and indoor mode is on.
        </p>
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Trusted device enforcement (this shop)
          <select
            className="max-w-[16rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={settings.device_enforcement_mode ?? "inherit"}
            disabled={disabled || saving}
            onChange={(e) => {
              const v = e.target.value;
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      device_enforcement_mode:
                        v === "inherit"
                          ? null
                          : (v as ShopAntiBuddySettings["device_enforcement_mode"]),
                    }
                  : s,
              );
            }}
          >
            <option value="inherit">Inherit company setting</option>
            <option value="allow_warn">Allow + warning</option>
            <option value="require_approval">Require manager approval</option>
            <option value="block_unknown">Block unknown devices</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void save()}
          className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-amber-700"
        >
          {saving ? "Saving…" : "Save Anti Buddy settings"}
        </button>
        {message ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
