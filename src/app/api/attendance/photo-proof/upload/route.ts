import { NextResponse } from "next/server";
import {
  loadShopForPunch,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { uploadPhotoProofFile } from "@/lib/photo-proof-upload";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Upload photo proof image only (before Clock In/Out). */
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
      loadShopForPunch(supabase, shopId, { includePhotoProofFlag: true }),
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

    const { shop } = shopResult;
    const { staff: staffRow } = staffResult;

    if (!shop.gpsIndoorMode || !shop.allowPhotoProofFallback) {
      return NextResponse.json(
        { error: "Photo proof is not enabled for this shop." },
        { status: 403 },
      );
    }

    const accessCheck = validatePunchAccess({
      shopId,
      storedToken: shop.punchQrToken,
      providedQr: punchQrToken,
      employeeSession: employeeSessionFromRequest(req),
      staffId: staffRow.id,
      staffAssignedToShop: true,
    });
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const uploaded = await uploadPhotoProofFile(supabase, shopId, staffRow.id, photoFile);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error }, { status: uploaded.status });
    }

    return NextResponse.json({
      ok: true,
      photo_proof_path: uploaded.path,
      photo_proof_uploaded_at: uploaded.uploadedAt,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
