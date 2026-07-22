"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function PhotoProofLink({ attendanceId }: { attendanceId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openPhoto() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/attendance/${encodeURIComponent(attendanceId)}/photo`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        throw new Error(j.error || "Could not load photo");
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
        onClick={() => void openPhoto()}
        className="text-left text-xs font-semibold text-violet-700 underline hover:text-violet-900 disabled:opacity-50 dark:text-violet-300"
      >
        {loading ? t("review.loading") : t("review.viewPhoto")}
      </button>
      {err ? <span className="text-[10px] text-red-600">{err}</span> : null}
    </span>
  );
}
