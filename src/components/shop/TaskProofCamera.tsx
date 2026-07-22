"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { compressTaskProofImage } from "@/lib/retail-tasks/task-photo-compress";
import {
  bindStreamToVideoElement,
  captureJpegFromVideo,
  isTaskProofCameraSupported,
  openTaskProofCameraStream,
  SelfieCameraError,
  stopMediaStream,
} from "@/lib/retail-tasks/task-proof-camera";

export type TaskProofCaptureResult = {
  file: File;
  previewUrl: string;
};

type Props = {
  allowGallery?: boolean;
  disabled?: boolean;
  onCaptured: (result: TaskProofCaptureResult) => void;
};

type Phase = "idle" | "opening" | "live" | "processing";

export function TaskProofCamera({
  allowGallery = false,
  disabled,
  onCaptured,
}: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const cameraErrorMessage = useCallback(
    (err: unknown): string => {
      if (err instanceof SelfieCameraError) {
        switch (err.code) {
          case "permission_denied":
            return t("tasks.staff.cameraPermissionDenied");
          case "not_supported":
            return t("tasks.staff.cameraNotSupported");
          case "camera_unavailable":
            return t("tasks.staff.cameraUnavailable");
          default:
            return t("tasks.staff.cameraUnavailable");
        }
      }
      return t("tasks.staff.cameraUnavailable");
    },
    [t],
  );

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

  useEffect(() => {
    return () => releaseStream();
  }, [releaseStream]);

  const processFile = useCallback(
    async (raw: File) => {
      setPhase("processing");
      setError(null);
      try {
        const compressed = await compressTaskProofImage(raw);
        const previewUrl = URL.createObjectURL(compressed.file);
        onCaptured({ file: compressed.file, previewUrl });
        setPhase("idle");
      } catch {
        setError(t("tasks.staff.uploadFailed"));
        setPhase("idle");
      }
    },
    [onCaptured, t],
  );

  const startCamera = useCallback(async () => {
    setError(null);
    releaseStream();

    if (!isTaskProofCameraSupported()) {
      setError(t("tasks.staff.cameraNotSupported"));
      if (allowGallery) fileInputRef.current?.click();
      return;
    }

    setPhase("opening");
    try {
      const stream = await openTaskProofCameraStream();
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new SelfieCameraError("camera_unavailable", "camera_unavailable");
      }

      await bindStreamToVideoElement(video, stream);
      setPhase("live");
    } catch (err) {
      releaseStream();
      setPhase("idle");
      setError(cameraErrorMessage(err));
    }
  }, [allowGallery, cameraErrorMessage, releaseStream, t]);

  const cancelCamera = useCallback(() => {
    releaseStream();
    setPhase("idle");
    setError(null);
  }, [releaseStream]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      setError(t("tasks.staff.cameraUnavailable"));
      return;
    }
    setPhase("processing");
    setError(null);
    try {
      const blob = await captureJpegFromVideo(video, 0.88);
      releaseStream();
      await processFile(new File([blob], "task-proof.jpg", { type: "image/jpeg" }));
    } catch (err) {
      setError(
        err instanceof SelfieCameraError
          ? cameraErrorMessage(err)
          : t("tasks.staff.cameraNotReady"),
      );
      setPhase("live");
    }
  }, [cameraErrorMessage, processFile, releaseStream, t]);

  const onGalleryPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      void processFile(file);
    },
    [processFile],
  );

  const busy = phase === "processing" || phase === "opening" || disabled;
  const showPreview = phase === "live" || phase === "opening";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {t("tasks.staff.capturePhoto")}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        {allowGallery ? t("tasks.staff.cameraOrGalleryHint") : t("tasks.staff.cameraOnlyHint")}
      </p>

      {/* Always mounted so videoRef is available before stream attach (iOS Safari / Android Chrome). */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden={!showPreview}
        className={
          showPreview
            ? "mt-2 aspect-[4/3] w-full rounded-lg bg-black object-cover"
            : "pointer-events-none fixed h-px w-px opacity-0"
        }
      />

      {showPreview ? (
        <div className="mt-2 space-y-2">
          {phase === "opening" ? (
            <p className="text-center text-xs text-zinc-500">{t("tasks.staff.openingCamera")}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || phase !== "live"}
              onClick={() => void capture()}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t("tasks.staff.captureNow")}
            </button>
            <button
              type="button"
              onClick={cancelCamera}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-600"
            >
              {t("tasks.staff.cancelCamera")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startCamera()}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
          >
            {phase === "processing"
              ? t("tasks.staff.processingPhoto")
              : t("tasks.staff.openCamera")}
          </button>
          {allowGallery ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onGalleryPick}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-xs font-semibold dark:border-zinc-600"
              >
                {t("tasks.staff.chooseGallery")}
              </button>
            </>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
