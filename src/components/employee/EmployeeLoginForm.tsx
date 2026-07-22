"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { sanitizeInternalReturnPath } from "@/lib/app-url";

type CompanyChoice = {
  account_id: string;
  company_id: string;
  company_name: string;
  staff_name: string;
};

export function EmployeeLoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyChoice[] | null>(null);

  async function submit(accountId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          password,
          account_id: accountId,
        }),
      });
      const j = (await res.json()) as {
        error?: string;
        ok?: boolean;
        choose_company?: boolean;
        companies?: CompanyChoice[];
        redirect?: string;
      };
      if (!res.ok) throw new Error(j.error || t("employee.login.invalidCredentials"));
      if (j.choose_company && j.companies?.length) {
        setCompanies(j.companies);
        return;
      }
      const next = sanitizeInternalReturnPath(
        searchParams.get("next") || j.redirect,
        "/employee/dashboard",
      );
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("employee.login.invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  if (companies) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{t("employee.login.chooseCompany")}</h1>
        <ul className="space-y-2">
          {companies.map((c) => (
            <li key={c.account_id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit(c.account_id)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span className="font-semibold">{c.company_name}</span>
                <span className="block text-xs text-zinc-500">{c.staff_name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="text-xs text-zinc-500 underline"
          onClick={() => setCompanies(null)}
        >
          {t("employee.login.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("employee.login.title")}</h1>
        <LanguageSelector />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("employee.login.subtitle")}</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <label className="block text-sm">
        {t("employee.login.identifier")}
        <input
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="block text-sm">
        {t("employee.login.password")}
        <input
          type="password"
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t("employee.login.signingIn") : t("employee.login.signIn")}
      </button>
      <p className="text-center text-xs text-zinc-500">
        <Link href="/login" className="underline">
          {t("employee.login.companyAdminLink")}
        </Link>
      </p>
    </div>
  );
}
