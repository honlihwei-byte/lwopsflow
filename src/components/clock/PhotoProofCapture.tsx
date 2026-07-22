"use client";

import { useCallback, useRef, useState } from "react";
import { compressPhotoProofImage } from "@/lib/photo-proof-compress";
import { formatMalaysiaRecordedAt } from "@/lib/malaysia-time";

export type PhotoProofPreview = {
  file: File;
  previewUrl: string;
  capturedAt: Date;
  capturedAtLabel: string;
  originalFileSize: number;
  compressedFileSize: number;
};

type Props = {
  shopName: string;
  staffName: string;
  gpsStatusLabel: string;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number;
  uploadSlow?: boolean;
  uploadError?: string | null;
  uploaded?: boolean;
  onPhotoReady: (preview: PhotoProofPreview | null) => void;
  onRetryUpload?: () => void;
};

export function PhotoProofCapture({
  shopName,
  staffName,
  gpsStatusLabel,
  disabled,
  uploading,
  uploadProgress = 0,
  uploadSlow,
  uploadError,
  uploaded,
  onPhotoReady,
  onRetryUpload,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PhotoProofPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const clearPreview = useCallback(() => {
    if (preview?.previewUrl) URL.revokeObjectURL(preview.previewUrl);
    setPreview(null);
    onPhotoReady(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onPhotoReady, preview?.previewUrl]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      setError(null);
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please capture a photo with your camera.");
        return;
      }

      setCompressing(true);
      try {
        const compressed = await compressPhotoProofImage(file);
        if (preview?.previewUrl) URL.revokeObjectURL(preview.previewUrl);
        const capturedAt = new Date();
        const next: PhotoProofPreview = {
          file: compressed.file,
          previewUrl: URL.createObjectURL(compressed.file),
          capturedAt,
          capturedAtLabel: formatMalaysiaRecordedAt(capturedAt.toISOString()),
          originalFileSize: compressed.originalFileSize,
          compressedFileSize: compressed.compressedFileSize,
        };
        setPreview(next);
        onPhotoReady(next);
      } catch {
        setError("Could not process photo. Try again with better lighting.");
      } finally {
        setCompressing(false);
      }
    },
    [onPhotoReady, preview?.previewUrl],
  );

  const busy = compressing || uploading;

  return (
    <section className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
      <p className="font-semibold">Photo Proof</p>
      <p className="mt-1 text-xs opacity-90">Take a photo to complete your punch without GPS.</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {!preview ? (
        <button
          type="button"
          disabled={disabled || compressing}
          onClick={() => inputRef.current?.click()}
          className="mt-3 w-full rounded-lg bg-violet-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-violet-600"
        >
          {compressing ? "Processing photo…" : "Take Photo Proof"}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-violet-200 dark:border-violet-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.previewUrl}
              alt="Photo proof preview"
              className="max-h-56 w-full object-cover"
            />
            <div
              className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/55 via-transparent to-black/65 p-2.5 text-white"
              aria-hidden
            >
              <p className="font-mono text-[11px] font-semibold leading-tight drop-shadow sm:text-xs">
                {preview.capturedAtLabel}
              </p>
              <div className="space-y-0.5 text-[11px] font-medium leading-snug drop-shadow sm:text-xs">
                <p>{staffName}</p>
                <p>{shopName}</p>
                <p>Clock In / Clock Out</p>
                <p>{gpsStatusLabel}</p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-violet-800/90 dark:text-violet-200/90">
            {Math.round(preview.originalFileSize / 1024)} KB →{" "}
            {Math.round(preview.compressedFileSize / 1024)} KB JPEG
          </p>

          {compressing ? (
            <p className="text-xs font-medium text-violet-800 dark:text-violet-200">
              Compressing photo…
            </p>
          ) : null}

          {uploading ? (
            <div className="space-y-1.5" role="status" aria-live="polite">
              <p className="text-xs font-semibold text-violet-900 dark:text-violet-100">
                Uploading proof…
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-900">
                <div
                  className="h-full rounded-full bg-violet-700 transition-[width] duration-150 dark:bg-violet-400"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs font-medium text-violet-800 dark:text-violet-200">
                Uploading photo… {uploadProgress}%
              </p>
              {uploadSlow ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                  <p>Upload taking longer than expected.</p>
                  {onRetryUpload ? (
                    <button
                      type="button"
                      onClick={onRetryUpload}
                      className="mt-1 font-semibold underline"
                    >
                      Retry Upload
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {uploaded ? (
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              Photo uploaded — tap the punch button below (no GPS required).
            </p>
          ) : null}

          <button
            type="button"
            disabled={disabled || busy}
            onClick={clearPreview}
            className="w-full rounded-lg border border-violet-400 px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Retake photo
          </button>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      {uploadError ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-red-700 dark:text-red-300">{uploadError}</p>
          {onRetryUpload && preview ? (
            <button
              type="button"
              onClick={onRetryUpload}
              className="text-xs font-semibold text-violet-900 underline dark:text-violet-100"
            >
              Retry Upload
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
