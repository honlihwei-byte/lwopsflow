import { NextResponse } from "next/server";
import {
  loadShopForPunch,
  validatePunchQrToken,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { SELFIE_PROOF_BUCKET } from "@/lib/selfie-proof-storage";
import { uploadSelfieProofFile } from "@/lib/selfie-proof-upload";
import type { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

type Supabase = ReturnType<typeof createAdminClient>;

export type SelfieUploadResult = {
  selfie_proof_path: string;
  selfie_captured_at: string;
  bucket: string;
  selfie_upload_status: "uploaded";
};

/** Server-side selfie upload (service role). Used by clock before punch save. */
export async function handleSelfieUploadRequest(
  supabase: Supabase,
  req: Request,
): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const shopId = String(form.get("shop_id") ?? "").trim();
    const staffId = String(form.get("staff_id") ?? "").trim();
    const staffIdentifier = String(form.get("staff_identifier") ?? "").trim();
    const actionRaw = String(form.get("action_type") ?? "").trim();
    const punchQrToken =
      normalizePunchQrToken(form.get("punch_qr_token")) ??
      normalizePunchQrToken(form.get("t"));
    const photoFile = form.get("photo");

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }
    if (actionRaw !== "clock_in" && actionRaw !== "clock_out") {
      return NextResponse.json(
        { error: "action_type must be clock_in or clock_out" },
        { status: 400 },
      );
    }
    if (!(photoFile instanceof File)) {
      return NextResponse.json({ error: "Photo is required." }, { status: 400 });
    }

    console.log("[upload-selfie] uploading selfie", {
      shopId,
      action: actionRaw,
      fileSize: photoFile.size,
      bucket: SELFIE_PROOF_BUCKET,
    });

    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: staffId || undefined,
        staffIdentifier: staffIdentifier || undefined,
      }),
    ]);

    if ("error" in shopResult) {
      console.log("[upload-selfie] selfie upload error", shopResult.error);
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if ("error" in staffResult) {
      console.log("[upload-selfie] selfie upload error", staffResult.error);
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }

    const qrCheck = validatePunchQrToken(shopId, shopResult.shop.punchQrToken, punchQrToken);
    if (!qrCheck.ok) {
      console.log("[upload-selfie] selfie upload error", qrCheck.error);
      return NextResponse.json({ error: qrCheck.error }, { status: 403 });
    }

    const companyId = shopResult.shop.companyId;
    if (!companyId) {
      return NextResponse.json({ error: "Shop has no company." }, { status: 400 });
    }

    const uploaded = await uploadSelfieProofFile(supabase, {
      companyId,
      shopId,
      staffId: staffResult.staff.id,
      actionType: actionRaw,
      file: photoFile,
    });

    if (!uploaded.ok) {
      console.log("[upload-selfie] selfie upload error", uploaded.error);
      return NextResponse.json(
        {
          error: uploaded.error,
          bucket: SELFIE_PROOF_BUCKET,
          details:
            "Ensure bucket attendance-selfies exists (migration 051) and SUPABASE_SERVICE_ROLE_KEY is set.",
        },
        { status: uploaded.status },
      );
    }

    let selfie_url: string | null = null;
    const { data: signed, error: signErr } = await supabase.storage
      .from(SELFIE_PROOF_BUCKET)
      .createSignedUrl(uploaded.path, 3600);
    if (!signErr && signed?.signedUrl) {
      selfie_url = signed.signedUrl;
    }

    console.log("[upload-selfie] selfie upload success", {
      path: uploaded.path,
      bucket: SELFIE_PROOF_BUCKET,
    });

    return NextResponse.json({
      ok: true,
      selfie_proof_path: uploaded.path,
      selfie_path: uploaded.path,
      selfie_captured_at: uploaded.uploadedAt,
      selfie_upload_status: "uploaded" as const,
      selfie_status: "uploaded" as const,
      bucket: SELFIE_PROOF_BUCKET,
      selfie_url,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log("[upload-selfie] selfie upload error", message);
    console.error("[upload-selfie] exception", e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
