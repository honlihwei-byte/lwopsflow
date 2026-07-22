"use client";

import { useRef, useState } from "react";
import { compressPhotoProofImage } from "@/lib/photo-proof-compress";

export type RandomSelfiePreview = {
  file: File;
  previewUrl: string;
  originalFileSize: number;
  compressedFileSize: number;
};

type Props = {
  onPhotoReady: (preview: RandomSelfiePreview | null) => void;
  uploading?: boolean;
  error?: string | null;
};

export function RandomSelfieCapture({ onPhotoReady, uploading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<RandomSelfiePreview | null>(null);
  const [compressing, setCompressing] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) {
      setPreview(null);
      onPhotoReady(null);
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressPhotoProofImage(file);
      const next: RandomSelfiePreview = {
        file: compressed.file,
        previewUrl: URL.createObjectURL(compressed.file),
        originalFileSize: file.size,
        compressedFileSize: compressed.file.size,
      };
      setPreview(next);
      onPhotoReady(next);
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="rounded-xl border border-fuchsia-300 bg-fuchsia-50/80 p-4 text-sm text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/30 dark:text-fuchsia-100">
      <p className="font-semibold">Random selfie check</p>
      <p className="mt-1 text-xs opacity-90">
        This punch requires a quick front-camera selfie for verification.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.previewUrl}
            alt="Selfie preview"
            className="mx-auto h-40 w-40 rounded-full object-cover ring-2 ring-fuchsia-400"
          />
          <button
            type="button"
            className="w-full rounded-lg border border-fuchsia-400 px-3 py-2 text-xs font-semibold"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || compressing}
          >
            Retake selfie
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-fuchsia-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || compressing}
        >
          {compressing ? "Processing…" : "Take selfie (front camera)"}
        </button>
      )}
      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
