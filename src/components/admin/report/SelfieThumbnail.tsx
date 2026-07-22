"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  attendanceId: string;
  label?: string;
};

export function SelfieThumbnail({ attendanceId, label = "Selfie" }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadUrls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${encodeURIComponent(attendanceId)}/selfie`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        pending?: boolean;
      };
      if (!res.ok) {
        if (j.pending) {
          setError("Upload pending");
          return;
        }
        throw new Error(j.error || "No selfie");
      }
      if (!j.url) throw new Error("No selfie URL");
      setThumbUrl(j.url);
      setFullUrl(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
      setThumbUrl(null);
      setFullUrl(null);
    } finally {
      setLoading(false);
    }
  }, [attendanceId]);

  useEffect(() => {
    void loadUrls();
  }, [loadUrls]);

  if (loading) {
    return <span className="text-[10px] text-slate-400">Loading…</span>;
  }

  if (error) {
    return <span className="text-[10px] text-amber-700">{error}</span>;
  }

  if (!thumbUrl) {
    return <span className="text-[10px] text-slate-400">—</span>;
  }

  return (
    <>
      <button
        type="button"
        className="group inline-flex flex-col items-center gap-0.5"
        onClick={() => setModalOpen(true)}
        title="View selfie"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl}
          alt={label}
          className="h-[50px] w-[50px] rounded-md border border-sky-200 object-cover ring-1 ring-sky-100 group-hover:ring-sky-400"
          width={50}
          height={50}
        />
        <span className="text-[10px] font-semibold text-sky-700 underline">View Photo</span>
      </button>

      {modalOpen && fullUrl ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Selfie full size"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-lg rounded-xl bg-white p-3 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white"
              onClick={() => setModalOpen(false)}
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullUrl}
              alt="Selfie full size"
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
