import { NextResponse } from "next/server";
import {
  loadShopForPunch,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { uploadRandomSelfieFile } from "@/lib/photo-proof-upload";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Upload random selfie verification image (front camera). */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const shopId = String(form.get("shop_id") ?? "").trim();
    const staffId = String(form.get("staff_id") ?? "").trim();
    const staffIdentifier = String(form.get("staff_identifier") ?? "").trim();
    const punchQrToken =
      normalizePunchQrToken(form.get("punch_qr_token")) ??
      normalizePunchQrToken(form.get("t"));
    const photoFile = form.get("photo");

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }
    if (!(photoFile instanceof File)) {
      return NextResponse.json({ error: "Photo is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: staffId || employeeSessionFromRequest(req)?.staffId || undefined,
        staffIdentifier: staffIdentifier || undefined,
      }),
    ]);

    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if ("error" in staffResult) {
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }

    const accessCheck = validatePunchAccess({
      shopId,
      storedToken: shopResult.shop.punchQrToken,
      providedQr: punchQrToken,
      employeeSession: employeeSessionFromRequest(req),
      staffId: staffResult.staff.id,
      staffAssignedToShop: true,
    });
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const uploaded = await uploadRandomSelfieFile(
      supabase,
      shopId,
      staffResult.staff.id,
      photoFile,
    );
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error }, { status: uploaded.status });
    }

    return NextResponse.json({
      ok: true,
      random_selfie_path: uploaded.path,
      photo_proof_uploaded_at: uploaded.uploadedAt,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
