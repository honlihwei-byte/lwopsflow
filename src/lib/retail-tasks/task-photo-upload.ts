import {
  buildTaskProofStoragePath,
  TASK_PROOF_ALLOWED_TYPES,
  TASK_PROOF_BUCKET,
  TASK_PROOF_MAX_BYTES,
} from "@/lib/retail-tasks/task-photo-storage";
import { applyTaskProofWatermarkServer } from "@/lib/retail-tasks/task-proof-watermark-server";
import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const SIGNED_PREVIEW_TTL_SEC = 3600;

export type TaskProofUploadParams = {
  companyId: string;
  shopId: string;
  taskId: string;
  staffId: string;
  file: File | Blob;
  mimeType: string;
  companyName: string;
  shopName: string;
  staffName: string;
};

export type TaskProofUploadResult = TaskProofPhotoRecord & {
  preview_url: string | null;
};

export async function uploadTaskProofPhoto(
  supabase: Supabase,
  params: TaskProofUploadParams,
): Promise<TaskProofUploadResult> {
  const mime = params.mimeType.toLowerCase();
  if (!TASK_PROOF_ALLOWED_TYPES.has(mime)) {
    throw new Error("Unsupported image type.");
  }
  if (params.file.size > TASK_PROOF_MAX_BYTES) {
    throw new Error("Image too large (max 5MB).");
  }

  const capturedAt = new Date();
  const originalPath = buildTaskProofStoragePath(
    params.companyId,
    params.shopId,
    params.taskId,
    params.staffId,
    capturedAt,
    "original",
  );
  const displayPath = buildTaskProofStoragePath(
    params.companyId,
    params.shopId,
    params.taskId,
    params.staffId,
    capturedAt,
    "display",
  );

  const originalBuffer = Buffer.from(await params.file.arrayBuffer());
  const displayBuffer = await applyTaskProofWatermarkServer(
    originalBuffer,
    {
      companyName: params.companyName,
      shopName: params.shopName,
      staffName: params.staffName,
    },
    capturedAt,
  );

  const bucket = supabase.storage.from(TASK_PROOF_BUCKET);

  const [originalUpload, displayUpload] = await Promise.all([
    bucket.upload(originalPath, originalBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    }),
    bucket.upload(displayPath, displayBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    }),
  ]);

  if (originalUpload.error) throw new Error(originalUpload.error.message);
  if (displayUpload.error) throw new Error(displayUpload.error.message);

  const { data: signed } = await bucket.createSignedUrl(displayPath, SIGNED_PREVIEW_TTL_SEC);

  return {
    original_path: originalPath,
    display_path: displayPath,
    captured_at: capturedAt.toISOString(),
    preview_url: signed?.signedUrl ?? null,
  };
}
