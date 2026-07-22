"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { createBrowserClient } from "@/lib/supabase/browser";

type LoginTab = "email" | "company_id";

export function CompanyLoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const verified = searchParams.get("verified") === "1";
  const verifiedCompanyId = searchParams.get("company_id");
  const authError = searchParams.get("error");

  const [tab, setTab] = useState<LoginTab>("email");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (verifiedCompanyId) {
      setCompanyId(verifiedCompanyId.trim().toUpperCase());
    }
  }, [verifiedCompanyId]);

  useEffect(() => {
    if (verified) {
      const idHint = verifiedCompanyId
        ? ` Your Company ID is ${verifiedCompanyId.toUpperCase()} — use Email Login or the Company ID tab.`
        : "";
      setSuccess(`Email verified successfully. You can now sign in.${idHint}`);
      setTab("email");
    } else if (authError === "verification_failed") {
      setError("Email verification failed or expired. Try resending from the verify page.");
    }
  }, [verified, authError, verifiedCompanyId]);

  function finishLogin(j: { redirect?: string; error?: string }) {
    if (j.redirect) {
      router.push(j.redirect);
      router.refresh();
      return;
    }
    const dest =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/admin";
    router.push(dest);
    router.refresh();
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        setError("Email address is required.");
        return;
      }

      const supabase = createBrowserClient();
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInErr || !data.session?.access_token) {
        const msg = signInErr?.message?.toLowerCase() ?? "";
        if (msg.includes("confirm") || msg.includes("verified") || msg.includes("verification")) {
          setError("Please verify your email before signing in.");
        } else {
          setError("Invalid email or password.");
        }
        return;
      }

      const res = await fetch("/api/auth/email-login", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.redirect) {
          router.push(j.redirect);
          return;
        }
        setError(j.error || "Sign in failed");
        return;
      }
      finishLogin(j);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompanyIdLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const normalizedId = companyId.trim().toUpperCase();
      if (!normalizedId) {
        setError("Company ID is required.");
        return;
      }

      const res = await fetch("/api/auth/company-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: normalizedId, password }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.redirect) {
          router.push(j.redirect);
          return;
        }
        setError(j.error || "Invalid company ID or password.");
        return;
      }
      finishLogin(j);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const tabBtn = (id: LoginTab, label: string) => (
    <button
      type="button"
      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        tab === id
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      }`}
      onClick={() => {
        setTab(id);
        setError(null);
      }}
      aria-selected={tab === id}
      role="tab"
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-md">
      <header className="text-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="login" priority />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("login.subtitle")}</p>
      </header>

      {success ? (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-2" role="tablist" aria-label={t("login.tabListAria")}>
        {tabBtn("email", t("login.emailTab"))}
        {tabBtn("company_id", t("login.companyIdTab"))}
      </div>

      {tab === "email" ? (
        <form
          onSubmit={handleEmailLogin}
          className="mt-4 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("login.email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
              autoComplete="email"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("login.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
              autoComplete="current-password"
              required
            />
          </label>
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-zinc-700 underline dark:text-zinc-300"
            >
              {t("login.forgotPassword")}
            </Link>
          </div>
          {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={loading} className={btnPrimary("w-full disabled:opacity-50")}>
            {loading ? t("button.signingIn") : t("button.signIn")}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleCompanyIdLogin}
          className="mt-4 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("login.companyId")}
            <input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value.toUpperCase())}
              placeholder="CMP-000001"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-mono uppercase tracking-wider dark:border-zinc-600 dark:bg-zinc-900"
              autoComplete="username"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("login.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
              autoComplete="current-password"
              required
            />
          </label>
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-zinc-700 underline dark:text-zinc-300"
            >
              {t("login.forgotPassword")}
            </Link>
          </div>
          {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={loading} className={btnPrimary("w-full disabled:opacity-50")}>
            {loading ? t("button.signingIn") : t("button.signIn")}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        {t("login.newCompany")}{" "}
        <Link href="/register" className="font-semibold text-zinc-900 underline dark:text-zinc-100">
          {t("register.title")}
        </Link>
      </p>
    </div>
  );
}
