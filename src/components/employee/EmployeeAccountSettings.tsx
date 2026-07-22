"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { useEmployeePermissions } from "@/components/employee/EmployeePermissionProvider";
import { storeLocale, type Locale } from "@/lib/i18n";
import { completePushOnboarding } from "@/lib/notifications/push-client";

type Account = {
  login_email: string | null;
  login_phone: string | null;
  preferred_locale: Locale;
};

export function EmployeeAccountSettings() {
  const { t, locale, setLocale } = useI18n();
  const { session } = useEmployeePermissions();
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<Locale>("en");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/employee/account", { credentials: "include" });
    const j = (await res.json()) as { account?: Account; error?: string };
    if (res.ok && j.account) {
      setAccount(j.account);
      setEmail(j.account.login_email ?? "");
      setPhone(j.account.login_phone ?? "");
      setPreferredLocale(j.account.preferred_locale ?? "en");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPrefs = useCallback(async () => {
    const res = await fetch("/api/employee/notification-preferences", { credentials: "include" });
    if (res.ok) {
      const j = (await res.json()) as {
        preferences?: { notifications_enabled?: boolean; push_enabled?: boolean };
      };
      setNotifEnabled(j.preferences?.notifications_enabled !== false);
      setPushEnabled(j.preferences?.push_enabled === true);
    }
  }, []);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  async function saveNotificationPrefs(next?: { push?: boolean }) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/employee/notification-preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifications_enabled: notifEnabled,
          push_enabled: next?.push ?? pushEnabled,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Failed");
      setMsg(t("notifications.preferences.saved"));
      await loadPrefs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function enableBrowserPush() {
    const result = await completePushOnboarding();
    if (!result.ok) {
      if (result.reason === "denied") setError(t("notifications.preferences.pushDenied"));
      else if (result.reason === "not_configured")
        setError(t("notifications.preferences.pushNotConfigured"));
      else if (result.reason === "unsupported")
        setError(t("notifications.preferences.pushUnsupported"));
      else setError(t("notifications.preferences.pushNotConfigured"));
      return;
    }
    setNotifEnabled(true);
    setPushEnabled(true);
    setMsg(t("notifications.preferences.saved"));
    await loadPrefs();
  }

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/employee/account", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_email: email || null,
          login_phone: phone || null,
          preferred_locale: preferredLocale,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed");
      setLocale(preferredLocale);
      storeLocale(preferredLocale);
      setMsg(t("employee.settings.saved"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      setError(t("employee.activate.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/employee/account", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMsg(t("employee.settings.passwordChanged"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return <p className="text-sm text-zinc-500">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("employee.settings.title")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("employee.settings.subtitle")}</p>
      </div>

      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {session?.authenticated ? (
        <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold">{t("employee.settings.profileTitle")}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-zinc-500">{t("positions.positionLabel")}</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {session.position_name ?? t("employee.profile.positionNotAssigned")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500">
                {t("employee.profile.assignedShops")}
              </dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {session.assigned_shops && session.assigned_shops.length > 0
                  ? session.assigned_shops.map((s) => s.name).join(", ")
                  : t("employee.profile.noShopsAssigned")}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">{t("employee.settings.contactTitle")}</h2>
        <label className="block text-sm">
          {t("employee.account.email")}
          <input
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          {t("employee.account.phone")}
          <input
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          {t("employee.settings.language")}
          <select
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value as Locale)}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ms">Bahasa Melayu</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveProfile()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("employee.settings.saving") : t("employee.settings.saveProfile")}
        </button>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">{t("notifications.preferences.title")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={(e) => setNotifEnabled(e.target.checked)}
          />
          {t("notifications.preferences.enable")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => setPushEnabled(e.target.checked)}
          />
          {t("notifications.preferences.enablePush")}
        </label>
        <p className="text-xs text-zinc-500">{t("notifications.preferences.pushHint")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveNotificationPrefs()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
          >
            {t("employee.settings.saveProfile")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enableBrowserPush()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("notifications.preferences.pushEnable")}
          </button>
          <Link
            href="/employee/test-notification"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Send Test Notification
          </Link>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">{t("employee.settings.passwordTitle")}</h2>
        <label className="block text-sm">
          {t("employee.settings.currentPassword")}
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="block text-sm">
          {t("employee.settings.newPassword")}
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm">
          {t("employee.settings.confirmPassword")}
          <input
            type="password"
            className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button
          type="button"
          disabled={busy || !currentPassword || !newPassword}
          onClick={() => void savePassword()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
        >
          {t("employee.settings.changePassword")}
        </button>
      </section>
    </div>
  );
}
