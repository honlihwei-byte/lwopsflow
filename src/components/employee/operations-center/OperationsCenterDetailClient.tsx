"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import type {
  EmployeeOperationsDetail,
  OperationsContentType,
} from "@/lib/operations-center/types";

function typeLabel(t: (key: string) => string, type: OperationsContentType): string {
  return t(`operationsCenter.types.${type}`);
}

function isDocMime(mime: string): boolean {
  return mime.includes("word") || mime === "application/msword";
}

function isSpreadsheetMime(mime: string): boolean {
  return mime.includes("spreadsheetml");
}
function formatDateRange(
  t: (key: string) => string,
  publish: string,
  effective: string,
  end: string | null,
): string {
  const effectivePart =
    effective !== publish
      ? t("operationsCenter.employee.effectiveFrom").replace("{date}", effective)
      : "";
  const until = end ? t("operationsCenter.employee.untilEnd").replace("{date}", end) : "";
  return t("operationsCenter.employee.effectiveUntil")
    .replace("{publish}", publish)
    .replace("{effective}", effectivePart)
    .replace("{until}", until);
}

export function OperationsCenterDetailClient() {
  const { t } = useI18n();
  const params = useParams();
  const contentId = String(params.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<EmployeeOperationsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employee/operations-center/${contentId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError(t("operationsCenter.employee.loadFailed"));
        return;
      }
      const j = (await res.json()) as { item?: EmployeeOperationsDetail };
      setItem(j.item ?? null);
    } finally {
      setLoading(false);
    }
  }, [contentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error || t("operationsCenter.employee.loadFailed"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/employee/operations-center/${contentId}/photo-proof`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error || t("operationsCenter.form.uploadFailed"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-base text-zinc-500">{t("common.loading")}</p>;
  }

  if (error && !item) {
    return (
      <div className="space-y-3">
        <p className="text-base text-red-600">{error}</p>
        <Link href="/employee/operations-center" className="text-sm font-semibold text-violet-600">
          ← {t("operationsCenter.employee.viewAll")}
        </Link>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-3">
        <p className="text-base text-red-600">{t("operationsCenter.employee.loadFailed")}</p>
        <Link href="/employee/operations-center" className="text-sm font-semibold text-violet-600">
          ← {t("operationsCenter.employee.viewAll")}
        </Link>
      </div>
    );
  }

  const needsAck = item.require_acknowledgement && !item.is_acknowledged;
  const needsTask = item.require_task_completion && !item.is_task_completed;
  const needsPhoto = item.require_photo_proof && !item.has_photo_proof;
  const hasAction = needsAck || needsTask || needsPhoto;

  return (
    <div className="space-y-4 pb-32">
      <Link href="/employee/operations-center" className="text-sm font-semibold text-violet-600">
        ← {t("operationsCenter.employee.viewAll")}
      </Link>

      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">
          {typeLabel(t, item.content_type)}
        </p>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{item.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {formatDateRange(t, item.publish_date, item.effective_date, item.end_date)}
        </p>
        {item.display_status === "upcoming" ? (
          <span className="mt-2 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
            {t("operationsCenter.displayStatus.upcoming")}
          </span>
        ) : null}
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-800 dark:text-zinc-100">
          {item.description}
        </p>
      </section>

      {item.attachments.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t("operationsCenter.employee.attachmentPreview")}
          </h2>
          {item.attachments.map((a: EmployeeOperationsDetail["attachments"][number]) => {
            if (a.mime_type === "application/pdf" && a.preview_url) {
              return (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <iframe title={a.file_name} src={a.preview_url} className="h-[60vh] w-full" />
                </div>
              );
            }
            if (a.mime_type.startsWith("image/") && a.preview_url) {
              return (
                <img
                  key={a.id}
                  src={a.preview_url}
                  alt={a.file_name}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700"
                />
              );
            }
            if (isDocMime(a.mime_type) && a.download_url) {
              return (
                <a
                  key={a.id}
                  href={a.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-violet-700 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  📄 {a.file_name}
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    {t("operationsCenter.detail.openDocument")}
                  </span>
                </a>
              );
            }
            if (isSpreadsheetMime(a.mime_type) && a.download_url) {
              return (
                <a
                  key={a.id}
                  href={a.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-violet-700 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  📊 {a.file_name}
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    {t("operationsCenter.detail.downloadSpreadsheet")}
                  </span>
                </a>
              );
            }
            return null;
          })}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-16 z-20 space-y-2 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
        {needsPhoto ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border border-violet-300 bg-violet-50 py-3 text-base font-semibold text-violet-900 disabled:opacity-60"
            >
              {busy ? t("operationsCenter.employee.acknowledging") : t("operationsCenter.employee.uploadPhoto")}
            </button>
          </>
        ) : item.has_photo_proof && item.my_photo_proof_url ? (
          <img
            src={item.my_photo_proof_url}
            alt=""
            className="mx-auto max-h-24 rounded-lg border border-zinc-200"
          />
        ) : null}

        {needsTask ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void postAction(`/api/employee/operations-center/${contentId}/complete`)}
            className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("operationsCenter.employee.acknowledging") : t("operationsCenter.employee.markComplete")}
          </button>
        ) : null}

        {needsAck ? (
          <button
            type="button"
            disabled={busy || needsPhoto}
            onClick={() => void postAction(`/api/employee/operations-center/${contentId}/acknowledge`)}
            className="w-full rounded-xl bg-violet-600 py-4 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? t("operationsCenter.employee.acknowledging") : t("operationsCenter.employee.acknowledge")}
          </button>
        ) : null}

        {!hasAction ? (
          <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {t("operationsCenter.employee.allDone")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
