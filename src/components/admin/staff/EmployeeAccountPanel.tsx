"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { getEmployeeLoginUrl } from "@/lib/app-url";

type Account = {
  id: string;
  login_email: string | null;
  login_phone: string | null;
  status: "pending_activation" | "active" | "disabled";
  has_password: boolean;
  activation_sent_at: string | null;
  activation_token_expires_at: string | null;
};

type StatusKey = "pending_activation" | "active" | "disabled" | "none";

function statusStyles(status: StatusKey): string {
  switch (status) {
    case "pending_activation":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "active":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "disabled":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

export function EmployeeAccountPanel({ staffId }: { staffId: string }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [employeeLoginUrl] = useState(() => getEmployeeLoginUrl());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/${encodeURIComponent(staffId)}/employee-account`, {
      credentials: "include",
    });
    if (res.ok) {
      const j = (await res.json()) as { account?: Account | null };
      setAccount(j.account ?? null);
      if (j.account) {
        setEmail(j.account.login_email ?? "");
        setPhone(j.account.login_phone ?? "");
      }
    } else {
      setAccount(null);
    }
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg(null);
    setActivationUrl(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(staffId)}/employee-account`, {
        method: account ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          account ? { action, ...body } : { login_email: email || null, login_phone: phone || null },
        ),
      });
      const j = (await res.json()) as {
        error?: string;
        activation_url?: string;
        account?: Account;
      };
      if (!res.ok) throw new Error(j.error || "Failed");
      if (j.activation_url) setActivationUrl(j.activation_url);
      setMsg(
        j.activation_url
          ? t("employee.account.invitationReady")
          : t("employee.account.saved"),
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyActivationLink() {
    if (!activationUrl) return;
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMsg(t("employee.account.copyFailed"));
    }
  }

  function statusKey(): StatusKey {
    if (!account) return "none";
    return account.status;
  }

  function statusLabel(status: Account["status"]): string {
    if (status === "pending_activation") return t("employee.account.statusPending");
    if (status === "disabled") return t("employee.account.statusDisabled");
    return t("employee.account.statusActive");
  }

  function formatExpiry(iso: string | null): string | null {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return null;
    }
  }

  if (account === undefined) return null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
            {t("employee.account.title")}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
            {t("employee.account.adminHint")}
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            statusStyles(statusKey()),
          ].join(" ")}
        >
          {account ? statusLabel(account.status) : t("employee.account.statusNone")}
        </span>
      </div>

      {msg ? (
        <p className="rounded-md bg-white/80 px-2 py-1.5 text-xs text-emerald-800 dark:bg-zinc-950/60 dark:text-emerald-300">
          {msg}
        </p>
      ) : null}

      {!account ? (
        <>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{t("employee.account.none")}</p>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t("employee.account.email")}
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t("employee.account.phone")}
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+60 …"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("create")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? t("employee.account.saving") : t("employee.account.sendInvitation")}
          </button>
        </>
      ) : (
        <>
          <dl className="grid gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
            {account.login_email ? (
              <div className="flex gap-2">
                <dt className="font-medium text-zinc-500">{t("employee.account.email")}:</dt>
                <dd>{account.login_email}</dd>
              </div>
            ) : null}
            {account.login_phone ? (
              <div className="flex gap-2">
                <dt className="font-medium text-zinc-500">{t("employee.account.phone")}:</dt>
                <dd>{account.login_phone}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="font-medium text-zinc-500">{t("employee.account.portalUrl")}:</dt>
              <dd className="font-mono text-[10px]">{employeeLoginUrl}</dd>
            </div>
            {account.activation_sent_at ? (
              <div className="flex gap-2">
                <dt className="font-medium text-zinc-500">{t("employee.account.lastSent")}:</dt>
                <dd>{formatExpiry(account.activation_sent_at)}</dd>
              </div>
            ) : null}
          </dl>

          {activationUrl ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                {t("employee.account.invitationGenerated")}
              </p>
              <p className="mt-1 text-[11px] text-amber-800/90 dark:text-amber-200/90">
                {t("employee.account.invitationPrivateHint")}
              </p>
              <button
                type="button"
                onClick={() => void copyActivationLink()}
                className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
              >
                {copied ? t("employee.account.copied") : t("employee.account.copyActivationLink")}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {(account.status === "pending_activation" || activationUrl) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction("resend_activation")}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-900"
              >
                {t("employee.account.resendInvitation")}
              </button>
            )}
            {account.status === "active" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction("reset_password")}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-900"
              >
                {t("employee.account.resetPassword")}
              </button>
            ) : null}
            {account.status === "disabled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction("enable")}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              >
                {t("employee.account.enableLogin")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction("disable")}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900"
              >
                {t("employee.account.disableLogin")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
