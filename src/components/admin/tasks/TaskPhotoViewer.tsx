"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  paths: string[];
  onClose: () => void;
};

async function fetchSignedUrl(path: string): Promise<string | null> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`/api/admin/retail-tasks/photo?${qs}`, { credentials: "include" });
  if (!res.ok) return null;
  const j = (await res.json()) as { url?: string };
  return j.url ?? null;
}

export function TaskPhotoViewer({ paths, onClose }: Props) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUrls = useCallback(async () => {
    setLoading(true);
    const signed = await Promise.all(paths.map((p) => fetchSignedUrl(p)));
    setUrls(signed);
    setLoading(false);
  }, [paths]);

  useEffect(() => {
    void loadUrls();
  }, [loadUrls]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(paths.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, paths.length]);

  const currentUrl = urls[index];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={t("tasks.detail.photoViewer")}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 text-sm font-semibold text-white"
        >
          {t("tasks.detail.close")}
        </button>

        {loading ? (
          <p className="text-center text-sm text-white">{t("tasks.loading")}</p>
        ) : !currentUrl ? (
          <p className="text-center text-sm text-white">{t("tasks.detail.photoLoadFailed")}</p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={currentUrl}
            alt=""
            className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
          />
        )}

        {paths.length > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => setIndex((i) => i - 1)}
              className="rounded bg-white/20 px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              {t("tasks.detail.prevPhoto")}
            </button>
            <span className="text-sm text-white">
              {index + 1} / {paths.length}
            </span>
            <button
              type="button"
              disabled={index >= paths.length - 1}
              onClick={() => setIndex((i) => i + 1)}
              className="rounded bg-white/20 px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              {t("tasks.detail.nextPhoto")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
