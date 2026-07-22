"use client";

import Link from "next/link";
import { useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Request failed");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50/80 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Check your email</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          If an account exists for that email, password reset instructions have been sent. Please
          check your inbox and spam folder.
        </p>
        <Link href="/login" className={`${btnPrimary("mt-8 inline-flex")}`}>
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Forgot password</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your registered company admin email. We will send a reset link if the account exists.
        </p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
            required
          />
        </label>
        {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
        <button type="submit" disabled={loading} className={btnPrimary("w-full disabled:opacity-50")}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/login" className="font-semibold underline">
          Back to Company Login
        </Link>
      </p>
    </div>
  );
}
