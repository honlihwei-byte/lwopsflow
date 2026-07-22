import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";

export type TaskPhotoUploadProgress = {
  percent: number;
  loaded: number;
  total: number;
};

export type TaskPhotoUploadResult = {
  photo: TaskProofPhotoRecord;
  preview_url: string | null;
};

export function uploadTaskProofWithProgress(
  url: string,
  form: FormData,
  onProgress?: (p: TaskPhotoUploadProgress) => void,
): Promise<{ ok: true; result: TaskPhotoUploadResult } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      onProgress?.({
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
        loaded: e.loaded,
        total: e.total,
      });
    });

    xhr.addEventListener("load", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      const photoRaw = body.photo;
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        photoRaw &&
        typeof photoRaw === "object" &&
        !Array.isArray(photoRaw)
      ) {
        const photo = photoRaw as Record<string, unknown>;
        const display_path = String(photo.display_path ?? body.photo_url ?? "").trim();
        if (!display_path) {
          resolve({ ok: false, error: String(body.error ?? "Upload failed") });
          return;
        }
        resolve({
          ok: true,
          result: {
            photo: {
              original_path: String(photo.original_path ?? display_path),
              display_path,
              captured_at: String(photo.captured_at ?? ""),
            },
            preview_url:
              body.preview_url != null ? String(body.preview_url) : null,
          },
        });
        return;
      }
      resolve({ ok: false, error: String(body.error ?? "Upload failed") });
    });

    xhr.addEventListener("error", () => resolve({ ok: false, error: "Network error while uploading." }));
    xhr.open("POST", url);
    xhr.send(form);
  });
}
