"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureJpegFromVideo,
  isSelfieCameraSupported,
  openSelfieCameraStream,
  SelfieCameraError,
  stopMediaStream,
} from "@/lib/selfie-camera-capture";
import { compressSelfieProofImage } from "@/lib/selfie-proof-compress";
import {
  logSelfieCaptured,
  logSelfieCompressedSize,
  logSelfieOriginalSize,
  selfieProofDebugLog,
} from "@/lib/selfie-proof-debug";
import { applySelfieProofOverlay } from "@/lib/selfie-proof-overlay";

export type SelfieProofPreview = {
  file: File;
  previewUrl: string;
  originalFileSize: number;
  compressedFileSize: number;
};

type Props = {
  staffName: string;
  shopName: string;
  actionLabel: string;
  dateTimeLabel: string;
  onPhotoReady: (preview: SelfieProofPreview | null) => void;
  processing?: boolean;
  error?: string | null;
};

type Phase = "idle" | "live" | "preview";

function mapProcessingError(err: unknown): string {
  if (err instanceof SelfieCameraError) return err.message;
  if (err instanceof Error) {
    if (/compress/i.test(err.message)) return "Could not process photo. Try again.";
    return err.message;
  }
  return "Could not process selfie. Try again.";
}

export function SelfieProofCapture({
  staffName,
  shopName,
  actionLabel,
  dateTimeLabel,
  onPhotoReady,
  processing: processingExternal,
  error: errorExternal,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<SelfieProofPreview | null>(null);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [rearFallbackNotice, setRearFallbackNotice] = useState<string | null>(null);

  const releaseStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try {
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    onPhotoReady(null);
  }, [onPhotoReady]);

  useEffect(() => {
    return () => {
      releaseStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [releaseStream]);

  const processBlob = useCallback(
    async (blob: Blob, sourceLabel: string) => {
      setProcessing(true);
      setLocalError(null);
      const originalSize = blob.size;
      logSelfieOriginalSize(originalSize);
      selfieProofDebugLog("selfie file size", { source: sourceLabel, bytes: originalSize });
      try {
        const compressed = await compressSelfieProofImage(blob);
        logSelfieCompressedSize(compressed.compressedFileSize);
        selfieProofDebugLog("compression result", {
          originalBytes: compressed.originalFileSize,
          compressedBytes: compressed.compressedFileSize,
          width: compressed.width,
          height: compressed.height,
        });
        const withOverlay = await applySelfieProofOverlay(compressed.file, {
          staffName,
          shopName,
          dateTime: dateTimeLabel,
          actionLabel,
        });
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const previewUrl = URL.createObjectURL(withOverlay);
        previewUrlRef.current = previewUrl;
        const next: SelfieProofPreview = {
          file: withOverlay,
          previewUrl,
          originalFileSize: compressed.originalFileSize,
          compressedFileSize: withOverlay.size,
        };
        setPreview(next);
        setPhase("preview");
        logSelfieCaptured();
        onPhotoReady(next);
      } catch (err) {
        setLocalError(mapProcessingError(err));
        selfieProofDebugLog("processing error", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setProcessing(false);
      }
    },
    [actionLabel, dateTimeLabel, onPhotoReady, shopName, staffName],
  );

  const startCamera = useCallback(async () => {
    setLocalError(null);
    setRearFallbackNotice(null);
    if (!isSelfieCameraSupported()) {
      fileInputRef.current?.click();
      return;
    }
    setProcessing(true);
    try {
      releaseStream();
      const { stream, usedRearFallback } = await openSelfieCameraStream();
      streamRef.current = stream;
      if (usedRearFallback) {
        setRearFallbackNotice("Front camera unavailable, using rear camera.");
      }
      setPhase("live");
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        void video.play().catch(() => {
          setLocalError("Camera unavailable");
        });
      });
    } catch (err) {
      setLocalError(mapProcessingError(err));
      if (err instanceof SelfieCameraError && err.code !== "permission_denied") {
        fileInputRef.current?.click();
      }
    } finally {
      setProcessing(false);
    }
  }, [releaseStream]);

  const captureFromLive = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      setLocalError("Camera unavailable");
      return;
    }
    setProcessing(true);
    setLocalError(null);
    try {
      const blob = await captureJpegFromVideo(video);
      releaseStream();
      await processBlob(blob, "live-camera");
    } catch (err) {
      setLocalError(mapProcessingError(err));
      setProcessing(false);
    }
  }, [processBlob, releaseStream]);

  const handleFileInput = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setProcessing(true);
      setLocalError(null);
      try {
        releaseStream();
        setPhase("idle");
        await processBlob(file, "file-input-fallback");
      } catch (err) {
        setLocalError(mapProcessingError(err));
      } finally {
        setProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [processBlob, releaseStream],
  );

  const retake = useCallback(() => {
    clearPreview();
    setPhase("idle");
    setRearFallbackNotice(null);
    void startCamera();
  }, [clearPreview, startCamera]);

  const busy = processing || processingExternal;

  const displayError = errorExternal ?? localError;

  return (
    <div className="rounded-xl border border-sky-300 bg-sky-50/80 p-4 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <p className="font-semibold">Selfie verification required</p>
      <p className="mt-1 text-xs opacity-90">
        Use your front camera. Your name, shop, time, and punch action are stamped on the photo.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(e) => void handleFileInput(e.target.files?.[0] ?? null)}
      />

      {rearFallbackNotice ? (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
          {rearFallbackNotice}
        </p>
      ) : null}

      {phase === "live" ? (
        <div className="mt-3 space-y-2">
          <video
            ref={videoRef}
            className="mx-auto max-h-52 w-full rounded-lg bg-black object-cover"
            playsInline
            muted
            autoPlay
          />
          <button
            type="button"
            className="w-full rounded-lg bg-sky-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void captureFromLive()}
          >
            {busy ? "Processing…" : "Capture selfie"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-sky-400 px-3 py-2 text-xs font-semibold"
            disabled={busy}
            onClick={() => {
              releaseStream();
              setPhase("idle");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {phase === "preview" && preview ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.previewUrl}
            alt="Selfie preview"
            className="mx-auto max-h-48 w-full rounded-lg object-contain ring-2 ring-sky-400"
          />
          <p className="text-center text-[11px] opacity-80">
            Selfie ready · {Math.round(preview.compressedFileSize / 1024)} KB
          </p>
          <button
            type="button"
            className="w-full rounded-lg border border-sky-400 px-3 py-2 text-xs font-semibold"
            disabled={busy}
            onClick={() => void retake()}
          >
            Retake selfie
          </button>
        </div>
      ) : null}

      {phase === "idle" ? (
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-sky-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void startCamera()}
        >
          {busy ? "Opening camera…" : "Take Selfie"}
        </button>
      ) : null}

      {displayError ? (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{displayError}</p>
      ) : null}
    </div>
  );
}
