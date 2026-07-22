"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { isEmployeeAppHost } from "@/lib/app-url";

function employeeLoginHref(): string {
  if (typeof window === "undefined") return "/employee/login";
  return isEmployeeAppHost(window.location.host) ? "/login" : "/employee/login";
}

export function EmployeeActivateForm({ token: tokenProp }: { token?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() ?? "";
  const token = tokenProp?.trim() || tokenFromQuery;

  const [loginHref, setLoginHref] = useState("/employee/login");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<{
    valid: boolean;
    staff_name?: string;
    company_name?: string;
    expired?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoginHref(employeeLoginHref());
  }, []);

  useEffect(() => {
    if (!token) return;
    void fetch(`/api/employee/auth/activate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => setPreview(j))
      .catch(() => setPreview({ valid: false }));
  }, [token]);

  async function submit() {
    if (password !== confirm) {
      setError(t("employee.activate.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/auth/activate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = (await res.json()) as { error?: string; redirect?: string };
      if (!res.ok) throw new Error(j.error || "Failed");
      router.replace(j.redirect ?? "/employee/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{t("employee.activate.title")}</h1>
        <p className="text-sm text-red-600">{t("employee.activate.missingToken")}</p>
        <Link href={loginHref} className="text-sm font-semibold text-emerald-700 underline">
          {t("employee.activate.backToLogin")}
        </Link>
      </div>
    );
  }

  if (!preview) {
    return <p className="text-sm text-zinc-500">{t("employee.activate.loading")}</p>;
  }

  if (!preview.valid) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{t("employee.activate.title")}</h1>
        <p className="text-sm text-red-600">
          {preview.expired ? t("employee.activate.expired") : t("employee.activate.invalid")}
        </p>
        <Link href={loginHref} className="text-sm font-semibold text-emerald-700 underline">
          {t("employee.activate.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("employee.activate.title")}</h1>
        <LanguageSelector />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("employee.activate.welcome")} {preview.staff_name} · {preview.company_name}
      </p>
      <p className="text-xs text-zinc-500">{t("employee.activate.subtitle")}</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <label className="block text-sm">
        {t("employee.activate.password")}
        <input
          type="password"
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label className="block text-sm">
        {t("employee.activate.confirmPassword")}
        <input
          type="password"
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t("employee.activate.saving") : t("employee.activate.submit")}
      </button>
    </div>
  );
}
