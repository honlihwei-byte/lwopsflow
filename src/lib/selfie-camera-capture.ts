import { selfieProofDebugLog } from "@/lib/selfie-proof-debug";

export type CameraFacing = "user" | "environment";

export type SelfieCameraOpenResult = {
  stream: MediaStream;
  facing: CameraFacing;
  usedRearFallback: boolean;
};

export type SelfieCameraErrorCode =
  | "permission_denied"
  | "camera_unavailable"
  | "not_supported"
  | "unknown";

export class SelfieCameraError extends Error {
  readonly code: SelfieCameraErrorCode;

  constructor(code: SelfieCameraErrorCode, message: string) {
    super(message);
    this.name = "SelfieCameraError";
    this.code = code;
  }
}

function mapGetUserMediaError(err: unknown): SelfieCameraError {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new SelfieCameraError("permission_denied", "Permission denied");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new SelfieCameraError("camera_unavailable", "Camera unavailable");
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return new SelfieCameraError("not_supported", "Camera not supported in this browser");
  }
  return new SelfieCameraError(
    "unknown",
    err instanceof Error ? err.message : "Camera unavailable",
  );
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch {
    /* ignore */
  }
}

export function isSelfieCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Prefer front camera; fall back to rear with caller showing a notice. */
export async function openSelfieCameraStream(): Promise<SelfieCameraOpenResult> {
  if (!isSelfieCameraSupported()) {
    throw new SelfieCameraError("not_supported", "Camera not supported in this browser");
  }

  const frontConstraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 720, max: 1280 },
      height: { ideal: 720, max: 1280 },
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(frontConstraints);
    selfieProofDebugLog("camera selected", { facing: "user", usedRearFallback: false });
    return { stream, facing: "user", usedRearFallback: false };
  } catch (frontErr) {
    selfieProofDebugLog("front camera failed", {
      error: frontErr instanceof Error ? frontErr.message : String(frontErr),
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 720, max: 1280 },
          height: { ideal: 720, max: 1280 },
        },
      });
      selfieProofDebugLog("camera selected", { facing: "environment", usedRearFallback: true });
      return { stream, facing: "environment", usedRearFallback: true };
    } catch (rearErr) {
      throw mapGetUserMediaError(rearErr);
    }
  }
}

export async function captureJpegFromVideo(
  video: HTMLVideoElement,
  quality = 0.85,
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    throw new SelfieCameraError("camera_unavailable", "Camera not ready. Try again.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not capture photo."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}
