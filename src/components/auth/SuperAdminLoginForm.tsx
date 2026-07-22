"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function SuperAdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmed = secret.trim();
    const isPin = /^\d{6}$/.test(trimmed);

    try {
      const res = await fetch(
        isPin ? "/api/admin/auth/login" : "/api/super-admin/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            isPin ? { role: "super_admin", pin: trimmed } : { password: trimmed },
          ),
        },
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Sign in failed");
        return;
      }
      const dest =
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/super-admin";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="text-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="login" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Platform sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Authorized operators only. Use your 6-digit PIN or platform password.
        </p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          PIN or password
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
        <button type="submit" disabled={loading} className={btnPrimary("w-full disabled:opacity-50")}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
