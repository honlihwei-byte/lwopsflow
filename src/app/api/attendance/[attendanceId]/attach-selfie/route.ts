import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  loadShopForPunch,
  validatePunchQrToken,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { SELFIE_PROOF_BUCKET } from "@/lib/selfie-proof-storage";
import { uploadSelfieProofFile } from "@/lib/selfie-proof-upload";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

const RECENT_PUNCH_ATTACH_MS = 24 * 60 * 60 * 1000;

/** Attach selfie proof to an existing attendance row (background upload after fast punch). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ attendanceId: string }> },
) {
  const { attendanceId } = await ctx.params;
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

    const { data: attendance, error: loadErr } = await supabase
      .from("attendance")
      .select("id, shop_id, staff_id, action_type, created_at, selfie_upload_status")
      .eq("id", attendanceId)
      .maybeSingle();

    if (loadErr) {
      console.error("[attach-selfie] load failed", loadErr);
      return NextResponse.json(
        { error: loadErr.message, bucket: SELFIE_PROOF_BUCKET },
        { status: 500 },
      );
    }
    if (!attendance) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
    if (String(attendance.shop_id) !== shopId) {
      return NextResponse.json({ error: "Shop mismatch" }, { status: 400 });
    }

    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: staffId || String(attendance.staff_id),
        staffIdentifier: staffIdentifier || undefined,
      }),
    ]);

    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if ("error" in staffResult) {
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }
    if (staffResult.staff.id !== String(attendance.staff_id)) {
      return NextResponse.json({ error: "Staff mismatch" }, { status: 403 });
    }

    let adminRetry = false;
    const adminScope = await requireCompanyFeatureAccess(req, supabase);
    if (!isNextResponse(adminScope)) {
      const deny = await assertShopScope(supabase, shopId, adminScope.companyId);
      if (!deny) adminRetry = true;
    }

    if (!adminRetry) {
      const qrCheck = validatePunchQrToken(shopId, shopResult.shop.punchQrToken, punchQrToken);
      if (!qrCheck.ok) {
        const createdMs = new Date(String(attendance.created_at)).getTime();
        const ageMs = Date.now() - createdMs;
        if (!Number.isFinite(createdMs) || ageMs > RECENT_PUNCH_ATTACH_MS) {
          console.error("[attach-selfie] QR rejected", {
            attendanceId,
            qrError: qrCheck.error,
            ageMs,
          });
          return NextResponse.json(
            {
              error: qrCheck.error,
              details: "Invalid or missing punch QR token for selfie attach.",
              bucket: SELFIE_PROOF_BUCKET,
            },
            { status: 403 },
          );
        }
        console.warn("[attach-selfie] QR check skipped for recent punch", {
          attendanceId,
          ageMs,
        });
      }
    } else {
      console.log("[attach-selfie] admin retry upload", { attendanceId, shopId });
    }

    const companyId = shopResult.shop.companyId;
    if (!companyId) {
      return NextResponse.json({ error: "Shop has no company." }, { status: 400 });
    }

    const uploaded = await uploadSelfieProofFile(supabase, {
      companyId,
      shopId,
      staffId: staffResult.staff.id,
      actionType:
        attendance.action_type === "clock_out" ? "clock_out" : "clock_in",
      file: photoFile,
    });
    if (!uploaded.ok) {
      console.error("[attach-selfie] storage upload failed", {
        attendanceId,
        error: uploaded.error,
        bucket: SELFIE_PROOF_BUCKET,
      });
      await supabase
        .from("attendance")
        .update({
          selfie_upload_status: "failed",
          audit_notes: `Selfie upload failed: ${uploaded.error}`.slice(0, 500),
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", attendanceId);
      return NextResponse.json(
        {
          error: uploaded.error,
          bucket: SELFIE_PROOF_BUCKET,
          details: "Check Supabase Storage bucket and service role key.",
        },
        { status: uploaded.status },
      );
    }

    console.log("[attach-selfie] storage upload ok", {
      attendanceId,
      bucket: SELFIE_PROOF_BUCKET,
      path: uploaded.path,
    });

    const capturedAt = uploaded.uploadedAt;
    const { error: updateErr } = await supabase
      .from("attendance")
      .update({
        selfie_proof_used: true,
        selfie_proof_path: uploaded.path,
        selfie_captured_at: capturedAt,
        selfie_upload_status: "uploaded",
        verification_method: "selfie_proof",
        last_updated_at: new Date().toISOString(),
        audit_notes: "Selfie proof attached after punch.",
      })
      .eq("id", attendanceId);

    if (updateErr) {
      console.error("[attach-selfie] attendance update failed", {
        attendanceId,
        path: uploaded.path,
        error: updateErr.message,
      });
      const missingStatus = /selfie_upload_status/i.test(updateErr.message ?? "");
      if (missingStatus) {
        const { error: retryErr } = await supabase
          .from("attendance")
          .update({
            selfie_proof_used: true,
            selfie_proof_path: uploaded.path,
            selfie_captured_at: capturedAt,
            verification_method: "selfie_proof",
            last_updated_at: new Date().toISOString(),
            audit_notes: "Selfie proof attached after punch.",
          })
          .eq("id", attendanceId);
        if (retryErr) {
          console.error("[attach-selfie] db update failed", retryErr);
          return NextResponse.json({ error: retryErr.message }, { status: 500 });
        }
      } else {
        console.error("[attach-selfie] db update failed", updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }

    console.log("[attach-selfie] attendance update success", {
      attendanceId,
      path: uploaded.path,
      bucket: SELFIE_PROOF_BUCKET,
    });

    return NextResponse.json({
      ok: true,
      selfie_proof_path: uploaded.path,
      selfie_captured_at: capturedAt,
      bucket: SELFIE_PROOF_BUCKET,
      selfie_upload_status: "uploaded",
    });
  } catch (e) {
    console.error("[attach-selfie] exception", e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
