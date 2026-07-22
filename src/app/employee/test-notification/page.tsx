"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";

type AuditResponse = {
  ok?: boolean;
  error?: string;
  notification_inserted?: boolean;
  notification_id?: string | null;
  notification_error?: string | null;
  push_sent?: boolean;
  push_accepted_by_service?: boolean;
  push_delivered_to_device?: string;
  push_sent_count?: number;
  push_failed_count?: number;
  push_skipped_reason?: string | null;
  subscription_count?: number;
  preferences?: { notifications_enabled?: boolean; push_enabled?: boolean };
  web_push?: {
    deliveries?: Array<{
      endpoint_preview: string;
      accepted_by_push_service: boolean;
      status_code: number | null;
      error: string | null;
      error_body: string | null;
    }>;
  };
  session?: {
    push_enabled?: boolean;
    subscription_count?: number;
  };
};

function TestNotificationInner() {
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/test-push", { credentials: "include" });
    const j = (await res.json()) as AuditResponse & { session?: AuditResponse["session"] };
    if (res.ok) setAudit(j);
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  async function sendTest() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/test-push", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "LW OpsFlow Test",
          message: "Browser push delivery successful",
        }),
      });
      const j = (await res.json()) as AuditResponse;
      if (!res.ok) {
        setError(j.error ?? "Request failed");
        setResult(j);
        return;
      }
      setResult(j);
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const session = audit?.session;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div>
        <Link href="/employee/settings" className="text-sm text-emerald-700 hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Test notification delivery</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Temporary diagnostic page. Creates an in-app notification and sends a browser push to
          your account.
        </p>
      </div>

      {session ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-semibold">Current session</h2>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            <li>push_enabled: {String(session.push_enabled ?? false)}</li>
            <li>subscription_count: {session.subscription_count ?? 0}</li>
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void sendTest()}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send Test Notification"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {result ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Delivery report</h2>
          <dl className="grid gap-2">
            <Row label="Notification inserted?" value={String(result.notification_inserted ?? false)} />
            <Row label="Notification ID" value={result.notification_id ?? "—"} />
            {result.notification_error ? (
              <Row label="Notification error" value={result.notification_error} warn />
            ) : null}
            <Row label="Push sent?" value={String(result.push_sent ?? false)} />
            <Row
              label="Push accepted by service?"
              value={String(result.push_accepted_by_service ?? false)}
            />
            <Row label="Push sent count" value={String(result.push_sent_count ?? 0)} />
            <Row label="Push failed count" value={String(result.push_failed_count ?? 0)} />
            {result.push_skipped_reason ? (
              <Row label="Push skipped" value={result.push_skipped_reason} warn />
            ) : null}
          </dl>

          {result.web_push?.deliveries?.length ? (
            <div className="mt-3 space-y-2">
              <h3 className="font-medium">web-push per subscription</h3>
              {result.web_push.deliveries.map((d) => (
                <pre
                  key={d.endpoint_preview}
                  className="overflow-x-auto rounded bg-white p-2 text-xs dark:bg-zinc-950"
                >
                  {JSON.stringify(d, null, 2)}
                </pre>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-zinc-500">{result.push_delivered_to_device}</p>

          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Raw JSON</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-white p-2 dark:bg-zinc-950">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={warn ? "text-right text-red-600" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}

export default function EmployeeTestNotificationPage() {
  return (
    <EmployeeSessionGate>
      <TestNotificationInner />
    </EmployeeSessionGate>
  );
}
