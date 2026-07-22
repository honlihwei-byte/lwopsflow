import {
  SelfieCameraError,
  stopMediaStream,
  captureJpegFromVideo,
} from "@/lib/selfie-camera-capture";

export { SelfieCameraError, stopMediaStream, captureJpegFromVideo };

export function isTaskProofCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function mapCameraError(err: unknown): SelfieCameraError {
  if (err instanceof SelfieCameraError) return err;
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new SelfieCameraError("permission_denied", "permission_denied");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new SelfieCameraError("camera_unavailable", "camera_unavailable");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new SelfieCameraError("camera_unavailable", "camera_unavailable");
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return new SelfieCameraError("not_supported", "not_supported");
  }
  if (name === "OverconstrainedError") {
    return new SelfieCameraError("camera_unavailable", "camera_unavailable");
  }
  return new SelfieCameraError("unknown", "unknown");
}

/** Attach a MediaStream to a video element — required for iOS Safari and Android Chrome. */
export async function bindStreamToVideoElement(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");

  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      video.removeEventListener("loadedmetadata", onReady);
      resolve();
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    window.setTimeout(resolve, 800);
  });

  try {
    await video.play();
  } catch {
    throw new SelfieCameraError("camera_unavailable", "camera_unavailable");
  }
}

/** Rear/environment camera for task proof — no gallery fallback. */
export async function openTaskProofCameraStream(): Promise<MediaStream> {
  if (!isTaskProofCameraSupported()) {
    throw new SelfieCameraError("not_supported", "not_supported");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
      },
    });
  } catch (err) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      } catch (fallbackErr) {
        throw mapCameraError(fallbackErr);
      }
    }
  }
}
