"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  translateForgotPunchReason,
  translateForgotPunchType,
} from "@/lib/i18n/employee-translate";
import {
  FORGOT_PUNCH_REASONS,
  FORGOT_PUNCH_REQUEST_TYPES,
  type ForgotPunchRequestType,
} from "@/lib/forgot-punch";
import {
  malaysiaDatetimeLocalValue,
  parseMalaysiaDatetimeLocal,
} from "@/lib/malaysia-time";

type Props = {
  open: boolean;
  onClose: () => void;
  shopId: string;
  punchQrToken?: string | null;
  /** Employee portal: authenticate via session cookie instead of QR token. */
  useEmployeeSession?: boolean;
  staffId: string;
  staffIdentifier: string;
  useManualCode: boolean;
  suggestedType?: ForgotPunchRequestType | null;
  onSubmitted?: () => void;
};

export function ForgotPunchRequestDialog({
  open,
  onClose,
  shopId,
  punchQrToken,
  useEmployeeSession = false,
  staffId,
  staffIdentifier,
  useManualCode,
  suggestedType,
  onSubmitted,
}: Props) {
  const { t } = useI18n();
  const [requestType, setRequestType] = useState<ForgotPunchRequestType>("forgot_clock_out");
  const [requestedTime, setRequestedTime] = useState(() => malaysiaDatetimeLocalValue());
  const [reason, setReason] = useState<string>(FORGOT_PUNCH_REASONS[0].value);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRequestType(suggestedType ?? "forgot_clock_out");
    setRequestedTime(malaysiaDatetimeLocalValue());
    setReason(FORGOT_PUNCH_REASONS[0].value);
    setNotes("");
    setError(null);
    setSuccess(null);
  }, [open, suggestedType]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = parseMalaysiaDatetimeLocal(requestedTime);
    if (!parsed) {
      setError(t("employee.forgotPunch.invalidDatetime"));
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        shop_id: shopId,
        request_type: requestType,
        requested_time: parsed.toISOString(),
        reason,
      };
      if (punchQrToken) body.punch_qr_token = punchQrToken;
      if (notes.trim()) body.notes = notes.trim();
      if (useManualCode) body.staff_identifier = staffIdentifier.trim();
      else body.staff_id = staffId;

      const res = await fetch("/api/forgot-punch-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: useEmployeeSession ? "include" : "same-origin",
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as {
        error?: string;
        request_type?: ForgotPunchRequestType;
        requested_display?: string;
      };
      if (!res.ok) throw new Error(j.error || t("employee.forgotPunch.submitFailed"));

      const typeLabel = translateForgotPunchType(t, j.request_type ?? requestType);
      const timeLabel = j.requested_display ?? t("employee.common.emDash");
      setSuccess(
        t("employee.forgotPunch.success")
          .replace("{type}", typeLabel)
          .replace("{time}", timeLabel),
      );
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("employee.forgotPunch.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-punch-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2">
          <h2 id="forgot-punch-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {t("employee.status.forgot_punch_request")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={t("employee.common.close")}
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {t("employee.forgotPunch.subtitle")}
        </p>

        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t("employee.forgotPunch.requestType")}
            </legend>
            {FORGOT_PUNCH_REQUEST_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="request_type"
                  checked={requestType === type}
                  onChange={() => setRequestType(type)}
                />
                {translateForgotPunchType(t, type)}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t("employee.forgotPunch.whenPunch")}
            <input
              type="datetime-local"
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950"
              value={requestedTime}
              onChange={(e) => setRequestedTime(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t("employee.forgotPunch.reason")}
            <select
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {FORGOT_PUNCH_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {translateForgotPunchReason(t, r.value)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t("employee.forgotPunch.note")}{" "}
            <span className="font-normal text-zinc-500">{t("employee.forgotPunch.optional")}</span>
            <textarea
              rows={3}
              maxLength={500}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("employee.forgotPunch.notePlaceholder")}
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              {success}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={submitting || Boolean(success)}
              className="rounded-xl bg-teal-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? t("employee.forgotPunch.submitting") : t("employee.forgotPunch.submit")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 py-3 text-sm font-semibold dark:border-zinc-600"
            >
              {success ? t("employee.common.close") : t("employee.common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
