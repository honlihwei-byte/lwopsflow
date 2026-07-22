export const PHOTO_PROOF_UPLOAD_SLOW_MS = 10_000;

export type PhotoProofUploadMetrics = {
  originalFileSize: number;
  compressedFileSize: number;
  uploadDurationMs: number;
};

export type PhotoProofUploadProgress = {
  percent: number;
  loaded: number;
  total: number;
};

export type PhotoProofUploadClientResult =
  | {
      ok: true;
      photo_proof_path: string;
      photo_proof_uploaded_at: string;
      metrics: PhotoProofUploadMetrics;
    }
  | { ok: false; error: string };

type UploadCallbacks = {
  onProgress?: (progress: PhotoProofUploadProgress) => void;
  onSlow?: () => void;
};

/**
 * POST multipart with upload progress (XHR). Does not send the original file — caller must compress first.
 */
export function uploadPhotoProofWithProgress(
  form: FormData,
  callbacks?: UploadCallbacks,
): { promise: Promise<PhotoProofUploadClientResult>; abort: () => void } {
  const started = performance.now();
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let slowFired = false;
  const xhr = new XMLHttpRequest();

  const promise = new Promise<PhotoProofUploadClientResult>((resolve) => {
    slowTimer = setTimeout(() => {
      slowFired = true;
      callbacks?.onSlow?.();
    }, PHOTO_PROOF_UPLOAD_SLOW_MS);

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
      callbacks?.onProgress?.({ percent, loaded: e.loaded, total: e.total });
    });

    xhr.addEventListener("load", () => {
      if (slowTimer) clearTimeout(slowTimer);
      const uploadDurationMs = Math.round(performance.now() - started);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* ignore */
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.photo_proof_path) {
        const original = Number(form.get("original_file_size") ?? 0);
        const compressed = Number(form.get("compressed_file_size") ?? 0);
        resolve({
          ok: true,
          photo_proof_path: String(body.photo_proof_path),
          photo_proof_uploaded_at: String(
            body.photo_proof_uploaded_at ?? new Date().toISOString(),
          ),
          metrics: {
            originalFileSize: original,
            compressedFileSize: compressed,
            uploadDurationMs,
          },
        });
        return;
      }

      resolve({
        ok: false,
        error: String(body.error ?? "Could not upload photo"),
      });
    });

    xhr.addEventListener("error", () => {
      if (slowTimer) clearTimeout(slowTimer);
      resolve({
        ok: false,
        error: slowFired
          ? "Upload failed. Check your connection and tap Retry Upload."
          : "Network error while uploading photo.",
      });
    });

    xhr.addEventListener("abort", () => {
      if (slowTimer) clearTimeout(slowTimer);
      resolve({ ok: false, error: "Upload cancelled." });
    });

    xhr.open("POST", "/api/attendance/photo-proof/upload");
    xhr.send(form);
  });

  return {
    promise,
    abort: () => xhr.abort(),
  };
}
