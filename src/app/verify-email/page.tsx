"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { btnPrimary, MarketingShell } from "@/components/marketing/MarketingShell";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email") ?? "";
  const [email] = useState(emailFromUrl);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resend() {
    if (!email) {
      setError("Email address is missing. Return to registration and try again.");
      return;
    }
    setError(null);
    setResendMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Could not resend verification email.");
        return;
      }
      setResendMsg(
        j.message ||
          "Verification email sent. Please check your inbox and spam folder.",
      );
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-sky-200 bg-sky-50/90 p-8 dark:border-sky-900 dark:bg-sky-950/40">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Please verify your email</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        We sent a verification link to:
      </p>
      {email ? (
        <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">{email}</p>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">your registered email address</p>
      )}
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Please check your spam/junk folder. If you still do not receive the email, click resend.
      </p>
      {resendMsg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {resendMsg}
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={loading}
        className={`${btnPrimary("mt-6 w-full disabled:opacity-50")}`}
        onClick={resend}
      >
        {loading ? "Sending…" : "Resend verification email"}
      </button>
      <Link
        href="/login"
        className="mt-4 flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      >
        Back to login
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <MarketingShell narrow>
      <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </MarketingShell>
  );
}
