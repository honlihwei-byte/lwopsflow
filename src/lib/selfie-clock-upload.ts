import type { SelfieProofPreview } from "@/components/clock/SelfieProofCapture";

export type SelfieUploadedForPunch = {
  selfie_proof_path: string;
  selfie_captured_at: string;
  selfie_upload_status: "uploaded";
  selfie_url?: string | null;
};

export type UploadSelfieBeforePunchParams = {
  shopId: string;
  punchQrToken: string;
  actionType: "clock_in" | "clock_out";
  preview: SelfieProofPreview;
  staffId?: string;
  staffIdentifier?: string;
};

/**
 * Upload selfie to Supabase Storage via server API (service role).
 * Must complete before attendance insert.
 */
export async function uploadSelfieBeforePunch(
  params: UploadSelfieBeforePunchParams,
): Promise<SelfieUploadedForPunch> {
  const file = params.preview.file;
  console.log("selfie captured", file.size);
  console.log("uploading selfie");

  const form = new FormData();
  form.set("shop_id", params.shopId);
  form.set("action_type", params.actionType);
  form.set("photo", file, "selfie.jpg");
  if (params.punchQrToken) form.set("punch_qr_token", params.punchQrToken);
  if (params.staffId) form.set("staff_id", params.staffId);
  if (params.staffIdentifier) form.set("staff_identifier", params.staffIdentifier);

  const res = await fetch("/api/upload-selfie", {
    method: "POST",
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    details?: string;
    selfie_proof_path?: string;
    selfie_captured_at?: string;
    selfie_url?: string | null;
    selfie_upload_status?: string;
  };

  if (!res.ok || !data.selfie_proof_path) {
    const errMsg = [data.error, data.details].filter(Boolean).join(" — ") || "Selfie upload failed";
    console.log("selfie upload error", errMsg);
    throw new Error(errMsg);
  }

  console.log("selfie upload success", data.selfie_proof_path);

  return {
    selfie_proof_path: data.selfie_proof_path,
    selfie_captured_at: data.selfie_captured_at ?? new Date().toISOString(),
    selfie_upload_status: "uploaded",
    selfie_url: data.selfie_url ?? null,
  };
}
