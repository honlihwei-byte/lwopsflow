import {
  clearPendingSelfieUpload,
  listPendingSelfieUploadIds,
  loadPendingSelfieUpload,
  pendingSelfieToFile,
  savePendingSelfieUpload,
} from "@/lib/selfie-pending-store";
import { SELFIE_PROOF_BUCKET } from "@/lib/selfie-proof-storage";
import { logSelfiePipeline, selfieProofDebugLog } from "@/lib/selfie-proof-debug";

export type SelfieAttachParams = {
  attendanceId: string;
  shopId: string;
  punchQrToken: string;
  file: File;
  staffId?: string;
  staffIdentifier?: string;
};

export type SelfieAttachResult =
  | { ok: true; selfie_proof_path: string; selfie_captured_at: string }
  | { ok: false; error: string; retryable: boolean; status?: number };

export type SelfieUploadProgress =
  | { phase: "uploading"; attempt: number; maxAttempts: number }
  | { phase: "retrying"; attempt: number; maxAttempts: number }
  | { phase: "success"; path: string }
  | { phase: "failed"; error: string };

function friendlyUploadError(status: number, message: string): string {
  if (status === 408 || message.toLowerCase().includes("timeout")) {
    return "Network timeout";
  }
  if (status >= 500) return "Upload failed";
  if (status === 403) return message || "Upload not authorized";
  return message || "Upload failed";
}

export async function attachSelfieToAttendance(
  params: SelfieAttachParams,
  signal?: AbortSignal,
): Promise<SelfieAttachResult> {
  const start = performance.now();
  logSelfiePipeline("Upload started", {
    attendanceId: params.attendanceId,
    bucket: SELFIE_PROOF_BUCKET,
    fileSize: params.file.size,
  });
  try {
    const form = new FormData();
    form.set("shop_id", params.shopId);
    if (params.punchQrToken) form.set("punch_qr_token", params.punchQrToken);
    form.set("photo", params.file, "selfie.jpg");
    if (params.staffId) form.set("staff_id", params.staffId);
    if (params.staffIdentifier) form.set("staff_identifier", params.staffIdentifier);

    const res = await fetch(
      `/api/attendance/${encodeURIComponent(params.attendanceId)}/attach-selfie`,
      { method: "POST", body: form, signal, credentials: "include" },
    );
    const data = (await res.json().catch(() => ({}))) as {
      selfie_proof_path?: string;
      selfie_captured_at?: string;
      error?: string;
      details?: string;
      bucket?: string;
    };
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errMsg = [data.error, data.details].filter(Boolean).join(" — ") || "Upload failed";
      logSelfiePipeline("Upload failed", {
        error: errMsg,
        status: res.status,
        bucket: data.bucket ?? SELFIE_PROOF_BUCKET,
        durationMs,
      });
      return {
        ok: false,
        error: friendlyUploadError(res.status, errMsg),
        retryable: res.status >= 500 || res.status === 408 || res.status === 429,
        status: res.status,
      };
    }
    if (!data.selfie_proof_path) {
      logSelfiePipeline("Upload failed", { error: "No path returned", durationMs });
      return { ok: false, error: "Upload failed", retryable: true, status: res.status };
    }
    logSelfiePipeline("Upload success", {
      path: data.selfie_proof_path,
      bucket: SELFIE_PROOF_BUCKET,
      durationMs,
    });
    clearPendingSelfieUpload(params.attendanceId);
    selfieProofDebugLog("upload URL", {
      attendanceId: params.attendanceId,
      storagePath: data.selfie_proof_path,
    });
    return {
      ok: true,
      selfie_proof_path: data.selfie_proof_path,
      selfie_captured_at: data.selfie_captured_at ?? new Date().toISOString(),
    };
  } catch (e) {
    const durationMs = Math.round(performance.now() - start);
    const errMsg = e instanceof Error ? e.message : String(e);
    logSelfiePipeline("Upload failed", { error: errMsg, durationMs });
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Upload cancelled", retryable: false };
    }
    const timeout = /timeout|network/i.test(errMsg);
    return {
      ok: false,
      error: timeout ? "Network timeout" : "Upload failed",
      retryable: true,
    };
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/** Retry any selfies saved on this device after a punch (clock page mount). */
export function flushPendingSelfieUploadsFromDevice(): void {
  if (typeof window === "undefined") return;
  for (const attendanceId of listPendingSelfieUploadIds()) {
    const pending = loadPendingSelfieUpload(attendanceId);
    if (!pending) continue;
    scheduleSelfieBackgroundUpload(
      {
        attendanceId: pending.attendanceId,
        shopId: pending.shopId,
        punchQrToken: pending.punchQrToken,
        file: pendingSelfieToFile(pending),
        staffId: pending.staffId,
        staffIdentifier: pending.staffIdentifier,
      },
      () => {},
    );
  }
}

export function scheduleSelfieBackgroundUpload(
  params: SelfieAttachParams,
  onProgress: (update: SelfieUploadProgress | null) => void,
): () => void {
  void savePendingSelfieUpload({
    attendanceId: params.attendanceId,
    shopId: params.shopId,
    punchQrToken: params.punchQrToken,
    file: params.file,
    staffId: params.staffId,
    staffIdentifier: params.staffIdentifier,
  }).catch((e) => {
    logSelfiePipeline("Upload failed", {
      error: e instanceof Error ? e.message : "Could not cache selfie for retry",
    });
  });

  let cancelled = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();

  async function run() {
    if (cancelled) return;
    attempt += 1;
    onProgress({
      phase: attempt === 1 ? "uploading" : "retrying",
      attempt,
      maxAttempts: MAX_RETRIES,
    });

    const result = await attachSelfieToAttendance(params, controller.signal);
    if (cancelled) return;

    if (result.ok) {
      onProgress({ phase: "success", path: result.selfie_proof_path });
      onProgress(null);
      return;
    }

    if (!result.retryable || attempt >= MAX_RETRIES) {
      onProgress({ phase: "failed", error: result.error });
      void markSelfieUploadFailed(params.attendanceId, params.shopId, result.error);
      return;
    }

    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]!;
    timer = setTimeout(() => void run(), delay);
  }

  void run();

  return () => {
    cancelled = true;
    controller.abort();
    if (timer != null) clearTimeout(timer);
  };
}

async function markSelfieUploadFailed(
  attendanceId: string,
  shopId: string,
  error: string,
): Promise<void> {
  try {
    await fetch(`/api/attendance/${encodeURIComponent(attendanceId)}/selfie-upload-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_id: shopId, status: "failed", error_message: error }),
    });
  } catch {
    /* ignore */
  }
}
