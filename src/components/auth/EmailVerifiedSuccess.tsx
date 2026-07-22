"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { btnPrimary, MarketingShell } from "@/components/marketing/MarketingShell";

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const companyId = (searchParams.get("company_id") ?? "").trim().toUpperCase();
  const [copied, setCopied] = useState(false);

  async function copyId() {
    if (!companyId) return;
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50/90 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Email verified successfully.</h1>

      {companyId ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-white/80 p-4 dark:border-emerald-800 dark:bg-zinc-950/60">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Company ID</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-zinc-900 dark:text-zinc-50">
            {companyId}
          </p>
          <button
            type="button"
            onClick={() => void copyId()}
            className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            {copied ? "Copied!" : "Copy Company ID"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Your account is active. Sign in to view your Company ID on the profile page.
        </p>
      )}

      <p className="mt-6 text-left text-sm text-zinc-700 dark:text-zinc-300">
        You can login using:
      </p>
      <ul className="mt-2 list-inside list-disc text-left text-sm text-zinc-600 dark:text-zinc-400">
        <li>Email + password</li>
        <li>Company ID + password</li>
      </ul>

      <Link
        href={companyId ? `/login?verified=1&company_id=${encodeURIComponent(companyId)}` : "/login?verified=1"}
        className={btnPrimary("mt-8 inline-flex w-full justify-center")}
      >
        Go to Login
      </Link>
    </div>
  );
}

export function EmailVerifiedSuccess() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <EmailVerifiedContent />
      </Suspense>
    </MarketingShell>
  );
}
