"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  completePushOnboarding,
  getBrowserNotificationPermission,
  isPushSupported,
} from "@/lib/notifications/push-client";
import {
  dismissPushOnboardingForToday,
  isPushOnboardingDismissedToday,
} from "@/lib/notifications/push-onboarding-storage";

type PrefsResponse = {
  preferences?: {
    notifications_enabled?: boolean;
    push_enabled?: boolean;
  };
  subscription_count?: number;
  push_available?: boolean;
};

function isFullySubscribed(
  prefs: PrefsResponse,
  permission: NotificationPermission | "unsupported",
): boolean {
  return (
    prefs.preferences?.push_enabled === true &&
    (prefs.subscription_count ?? 0) > 0 &&
    permission === "granted"
  );
}

export function PushOnboardingPrompt() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    if (!isPushSupported()) return;
    if (isPushOnboardingDismissedToday()) return;

    const permission = getBrowserNotificationPermission();
    if (permission === "denied") {
      setBlocked(true);
      setVisible(true);
      return;
    }

    const res = await fetch("/api/employee/notification-preferences", {
      credentials: "include",
    });
    if (!res.ok) return;

    const prefs = (await res.json()) as PrefsResponse;
    if (!prefs.push_available) return;
    if (isFullySubscribed(prefs, permission)) return;

    setBlocked(false);
    setVisible(true);
  }, []);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  function handleLater() {
    dismissPushOnboardingForToday();
    setVisible(false);
    setError(null);
  }

  async function handleAllow() {
    setBusy(true);
    setError(null);
    try {
      const result = await completePushOnboarding();
      if (result.ok) {
        setVisible(false);
        return;
      }
      if (result.reason === "denied") {
        setBlocked(true);
        return;
      }
      if (result.reason === "not_configured") {
        setVisible(false);
        return;
      }
      if (result.reason === "unsupported") {
        setVisible(false);
        return;
      }
      setError(t("notifications.preferences.pushNotConfigured"));
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <section
      className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40"
      role="dialog"
      aria-labelledby="push-onboarding-title"
    >
      <h2 id="push-onboarding-title" className="text-base font-semibold text-emerald-950 dark:text-emerald-50">
        {t("notifications.onboarding.title")}
      </h2>

      {blocked ? (
        <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
          {t("notifications.onboarding.denied")}
        </p>
      ) : (
        <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
          {t("notifications.onboarding.body")}
        </p>
      )}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!blocked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAllow()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? t("notifications.onboarding.enabling") : t("notifications.onboarding.allow")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={handleLater}
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
        >
          {t("notifications.onboarding.later")}
        </button>
      </div>

      <p className="mt-3 text-xs text-emerald-800/80 dark:text-emerald-200/70">
        <Link href="/employee/settings" className="underline hover:no-underline">
          {t("notifications.onboarding.settingsLink")}
        </Link>
      </p>
    </section>
  );
}
