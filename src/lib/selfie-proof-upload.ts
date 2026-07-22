import {
  buildSelfieProofStoragePath,
  SELFIE_PROOF_ALLOWED_TYPES,
  SELFIE_PROOF_BUCKET,
  SELFIE_PROOF_MAX_BYTES,
  selfieProofExtension,
} from "@/lib/selfie-proof-storage";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type SelfieProofUploadResult =
  | { ok: true; path: string; uploadedAt: string; mime: string }
  | { ok: false; error: string; status: number };

export async function uploadSelfieProofFile(
  supabase: Supabase,
  params: {
    companyId: string;
    shopId: string;
    staffId: string;
    actionType: "clock_in" | "clock_out";
    file: File;
  },
): Promise<SelfieProofUploadResult> {
  if (params.file.size === 0 || params.file.size > SELFIE_PROOF_MAX_BYTES) {
    return { ok: false, error: "Photo is too large (max 5 MB).", status: 400 };
  }
  const mime = (params.file.type || "image/jpeg").toLowerCase();
  if (!SELFIE_PROOF_ALLOWED_TYPES.has(mime)) {
    return { ok: false, error: "Photo must be JPEG, PNG, or WebP.", status: 400 };
  }

  const uploadedAt = new Date();
  const { path: storagePath } = buildSelfieProofStoragePath(
    params.companyId,
    params.shopId,
    params.staffId,
    params.actionType,
    uploadedAt,
  );
  const ext = selfieProofExtension(mime);
  const pathWithExt =
    ext === "jpg" ? storagePath : storagePath.replace(/\.jpg$/, `.${ext}`);

  const bytes = Buffer.from(await params.file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(SELFIE_PROOF_BUCKET)
    .upload(pathWithExt, bytes, { contentType: mime, upsert: false });

  if (uploadErr) {
    console.error(uploadErr);
    return {
      ok: false,
      error:
        uploadErr.message ||
        "Could not upload selfie. Ensure bucket attendance-selfies exists in Supabase Storage.",
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
