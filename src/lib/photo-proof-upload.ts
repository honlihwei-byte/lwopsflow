import {
  buildPhotoProofStagingPath,
  buildRandomSelfieStoragePath,
  PHOTO_PROOF_ALLOWED_TYPES,
  PHOTO_PROOF_BUCKET,
  PHOTO_PROOF_MAX_BYTES,
  photoProofExtension,
} from "@/lib/photo-proof-storage";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type PhotoProofUploadResult =
  | { ok: true; path: string; uploadedAt: string; mime: string }
  | { ok: false; error: string; status: number };

export async function uploadPhotoProofFile(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  file: File,
): Promise<PhotoProofUploadResult> {
  if (file.size === 0 || file.size > PHOTO_PROOF_MAX_BYTES) {
    return { ok: false, error: "Photo is too large (max 5 MB).", status: 400 };
  }
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!PHOTO_PROOF_ALLOWED_TYPES.has(mime)) {
    return { ok: false, error: "Photo must be JPEG, PNG, or WebP.", status: 400 };
  }

  const uploadedAt = new Date();
  const { path: storagePath } = buildPhotoProofStagingPath(shopId, staffId, uploadedAt);
  const ext = photoProofExtension(mime);
  const pathWithExt = storagePath.replace(/\.jpg$/, `.${ext}`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_PROOF_BUCKET)
    .upload(pathWithExt, bytes, { contentType: mime, upsert: false });

  if (uploadErr) {
    console.error(uploadErr);
    return {
      ok: false,
      error:
        uploadErr.message ||
        "Could not upload photo. Ensure bucket attendance-proofs exists in Supabase Storage.",
      status: 500,
    };
  }

  return {
    ok: true,
    path: pathWithExt,
    uploadedAt: uploadedAt.toISOString(),
    mime,
  };
}

export async function uploadRandomSelfieFile(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  file: File,
): Promise<PhotoProofUploadResult> {
  if (file.size === 0 || file.size > PHOTO_PROOF_MAX_BYTES) {
    return { ok: false, error: "Photo is too large (max 5 MB).", status: 400 };
  }
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!PHOTO_PROOF_ALLOWED_TYPES.has(mime)) {
    return { ok: false, error: "Photo must be JPEG, PNG, or WebP.", status: 400 };
  }

  const uploadedAt = new Date();
  const { path: storagePath } = buildRandomSelfieStoragePath(shopId, staffId, uploadedAt);
  const ext = photoProofExtension(mime);
  const pathWithExt = storagePath.replace(/\.jpg$/, `.${ext}`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_PROOF_BUCKET)
    .upload(pathWithExt, bytes, { contentType: mime, upsert: false });

  if (uploadErr) {
    console.error(uploadErr);
    return {
      ok: false,
      error: uploadErr.message || "Could not upload selfie.",
      status: 500,
    };
  }

  return {
    ok: true,
    path: pathWithExt,
    uploadedAt: uploadedAt.toISOString(),
    mime,
  };
}
