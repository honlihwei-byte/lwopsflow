"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";
import { createBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        void supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ data }) => {
            setEmail(data.session?.user.email ?? null);
            setReady(true);
            window.history.replaceState(null, "", window.location.pathname);
          })
          .catch(() => setError("Invalid or expired reset link."));
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        setEmail(session.user.email ?? null);
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setEmail(data.session.user.email ?? null);
        setReady(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        await fetch("/api/auth/sync-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password }),
        });
      }
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50/80 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
        <h1 className="text-xl font-bold">Password updated</h1>
        <p className="mt-3 text-sm text-zinc-600">Redirecting to login…</p>
      </div>
    );
  }

  if (!ready && !error) {
    return (
      <p className="text-center text-sm text-zinc-500">
        Loading reset session… Open the link from your email if you have not already.
      </p>
    );
  }

  if (!ready && error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/forgot-password" className={`${btnPrimary("mt-6 inline-flex")}`}>
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Reset password</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Choose a new password for your account.</p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
        <button type="submit" disabled={loading} className={btnPrimary("w-full disabled:opacity-50")}>
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
