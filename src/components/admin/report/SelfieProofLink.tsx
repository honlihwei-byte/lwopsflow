"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function SelfieProofLink({ attendanceId }: { attendanceId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openSelfie() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/attendance/${encodeURIComponent(attendanceId)}/selfie`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        throw new Error(j.error || "Could not load selfie");
      }
      window.open(j.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        disabled={loading}
        onClick={() => void openSelfie()}
        className="text-left text-xs font-semibold text-sky-700 underline hover:text-sky-900 disabled:opacity-50 dark:text-sky-300"
      >
        {loading ? t("review.loading") : t("review.viewSelfie")}
      </button>
      {err ? <span className="text-[10px] text-red-600">{err}</span> : null}
    </span>
  );
}
