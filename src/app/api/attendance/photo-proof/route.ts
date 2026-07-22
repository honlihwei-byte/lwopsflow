import { NextResponse } from "next/server";
import type { PunchActionType } from "@/lib/attendance";
import { ATTENDANCE_FAST_PUNCH_SELECT } from "@/lib/attendance-db";
import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import {
  loadShopForPunch,
  parsePunchGpsExtras,
  parseStaffGps,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { deviceMetaToInsertFields, punchDeviceMetaFromRequest } from "@/lib/punch-device-meta";
import { applyAntiBuddyFieldsToInsert } from "@/lib/punch-risk-insert";
import { PHOTO_PROOF_BUCKET } from "@/lib/photo-proof-storage";
import { uploadPhotoProofFile } from "@/lib/photo-proof-upload";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { formatEventTimeDisplay } from "@/lib/malaysia-time";
import { enforceSmartPunchOnServer } from "@/lib/smart-punch-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const shopId = String(form.get("shop_id") ?? "").trim();
    const actionType = String(form.get("action_type") ?? "").trim();
    const staffId = String(form.get("staff_id") ?? "").trim();
    const staffIdentifier = String(form.get("staff_identifier") ?? "").trim();
    const existingPath = String(form.get("photo_proof_path") ?? "").trim();
    const punchQrToken =
      normalizePunchQrToken(form.get("punch_qr_token")) ??
      normalizePunchQrToken(form.get("t"));
    const cameraRequested = form.get("camera_requested") === "true";
    const photoFile = form.get("photo");
    const uploadedAtRaw = String(form.get("photo_proof_uploaded_at") ?? "").trim();
    const originalFileSize = parseOptionalInt(form.get("original_file_size"));
    const compressedFileSize = parseOptionalInt(form.get("compressed_file_size"));
    const uploadDurationMs = parseOptionalInt(form.get("upload_duration_ms"));

    const validAction =
      actionType === "clock_in" ||
      actionType === "clock_out" ||
      actionType === "rest_in" ||
      actionType === "rest_out";
    if (!shopId || !validAction) {
      return NextResponse.json(
        { error: "shop_id and action_type are required" },
        { status: 400 },
      );
    }
    const punchAction = actionType as PunchActionType;

    const supabase = createAdminClient();
    const employeeSession = employeeSessionFromRequest(req);
    const effectiveStaffId = staffId || employeeSession?.staffId || undefined;

    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId, { includePhotoProofFlag: true }),
      validateStaffForPunch(supabase, shopId, {
        staffId: effectiveStaffId,
        staffIdentifier: employeeSession ? undefined : staffIdentifier || undefined,
        employeePortalShopAccess: Boolean(employeeSession),
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

    if (employeeSession && employeeSession.staffId !== staffRow.id) {
      return NextResponse.json(
        { error: "You can only punch as your logged-in employee account." },
        { status: 403 },
      );
    }

    const verifiedEmployeeIdentity = Boolean(
      employeeSession && employeeSession.staffId === staffRow.id,
    );

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
      employeeSession,
      staffId: staffRow.id,
      staffAssignedToShop: true,
    });
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const smart = await enforceSmartPunchOnServer(supabase, {
      shopId,
      shopName: shop.name,
      staffId: staffRow.id,
      staffName: staffRow.staff_name,
      staffCode: staffRow.staff_code,
      staffType: staffRow.staff_type,
      actionType: punchAction,
    });
    if (smart.block) {
      return NextResponse.json(smart.block.body, { status: smart.block.status });
    }
    const missingRestIn = smart.missingRestIn;

    const gpsBody: Record<string, unknown> = {
      staff_latitude: form.get("staff_latitude"),
      staff_longitude: form.get("staff_longitude"),
      gps_accuracy_meters: form.get("gps_accuracy_meters"),
    };
    const gpsParsed = parseStaffGps(gpsBody);
    const lat = gpsParsed.ok ? gpsParsed.lat : null;
    const lng = gpsParsed.ok ? gpsParsed.lng : null;
    const accuracyM = gpsParsed.ok ? gpsParsed.accuracyM : null;

    const punchedAt = new Date();
    let pathWithExt = existingPath;
    let photoUploadedAt = uploadedAtRaw ? new Date(uploadedAtRaw) : punchedAt;

    if (existingPath) {
      const prefix = `${shopId}/${staffRow.id}/`;
      if (!existingPath.startsWith(prefix)) {
        return NextResponse.json({ error: "Invalid photo proof path." }, { status: 400 });
      }
    } else if (photoFile instanceof File && photoFile.size > 0) {
      const uploaded = await uploadPhotoProofFile(supabase, shopId, staffRow.id, photoFile);
      if (!uploaded.ok) {
        return NextResponse.json({ error: uploaded.error }, { status: uploaded.status });
      }
      pathWithExt = uploaded.path;
      photoUploadedAt = new Date(uploaded.uploadedAt);
    } else {
      return NextResponse.json({ error: "Photo is required." }, { status: 400 });
    }

    const { event_date, event_time } = buildAttendanceEventFields(punchedAt);
    const gpsStatusNote = String(form.get("gps_status_note") ?? "GPS not verified").slice(0, 200);

    const extras = parsePunchGpsExtras({
      punch_device_id: form.get("punch_device_id"),
      punch_browser_info: form.get("punch_browser_info"),
      punch_device_name: form.get("punch_device_name"),
      punch_os_name: form.get("punch_os_name"),
      punch_browser: form.get("punch_browser"),
      punch_platform: form.get("punch_platform"),
      punch_user_agent: form.get("punch_user_agent"),
      random_selfie_path: form.get("random_selfie_path"),
      selfie_proof_path: form.get("selfie_proof_path"),
      selfie_captured_at: form.get("selfie_captured_at"),
      selfie_challenge_token: form.get("selfie_challenge_token"),
    });

    const deviceMeta = punchDeviceMetaFromRequest(extras);

    let insertRow: Record<string, unknown> = {
      shop_id: shopId,
      shop_name: shop.name,
      staff_id: staffRow.id,
      staff_name: staffRow.staff_name,
      staff_code: staffRow.staff_code,
      staff_type: staffRow.staff_type,
      action_type: actionType,
      event_date,
      event_time,
      staff_latitude: lat,
      staff_longitude: lng,
      distance_from_shop_meters: null,
      gps_accuracy_meters: accuracyM,
      gps_verified: false,
      gps_verify_tier: "review_required",
      gps_review_required: true,
      review_required: true,
      verification_method: "photo_proof",
      photo_proof_used: true,
      photo_proof_path: pathWithExt,
      photo_proof_uploaded_at: photoUploadedAt.toISOString(),
      ...deviceMetaToInsertFields(deviceMeta),
      audit_notes: cameraRequested
        ? `Photo proof (camera requested). ${gpsStatusNote}`
        : `Photo proof. ${gpsStatusNote}`,
      ...(originalFileSize != null
        ? { photo_proof_original_file_size: originalFileSize }
        : {}),
      ...(compressedFileSize != null
        ? { photo_proof_compressed_file_size: compressedFileSize }
        : {}),
      ...(uploadDurationMs != null ? { photo_proof_upload_duration_ms: uploadDurationMs } : {}),
      ...(missingRestIn
        ? {
            missing_rest_in: true,
            needs_review: true,
            exception_type: "missing_rest_in",
          }
        : {}),
    };

    const riskApplied = await applyAntiBuddyFieldsToInsert(supabase, insertRow, {
      staffId: staffRow.id,
      shopId,
      companyId: shop.companyId,
      actionType: punchAction,
      deviceId: deviceMeta.punch_device_id,
      browserInfo: deviceMeta.punch_browser_info,
      gpsAccuracyM: accuracyM,
      photoProofUsed: true,
      verificationMethod: "photo_proof",
      randomSelfiePath: extras.random_selfie_path ?? null,
      selfieProofPath: extras.selfie_proof_path ?? null,
      selfieCapturedAt: extras.selfie_captured_at ?? null,
      selfieChallengeToken: extras.selfie_challenge_token ?? null,
      existingReviewRequired: true,
      deviceName: deviceMeta.punch_device_name,
      osName: deviceMeta.punch_os_name,
      eventDate: event_date,
      verifiedEmployeeIdentity,
    });
    if (riskApplied.error) {
      return NextResponse.json({ error: riskApplied.error }, { status: riskApplied.status ?? 400 });
    }
    insertRow = riskApplied.row;

    const { data, error } = await supabase
      .from("attendance")
      .insert(insertRow)
      .select(ATTENDANCE_FAST_PUNCH_SELECT)
      .single();

    if (error || !data) {
      console.error(error);
      if (!existingPath && pathWithExt) {
        await supabase.storage.from(PHOTO_PROOF_BUCKET).remove([pathWithExt]);
      }
      return NextResponse.json(
        { error: error?.message || "Failed to save attendance" },
        { status: 500 },
      );
    }

    const displayTime = formatEventTimeDisplay(
      data.event_time != null ? String(data.event_time) : event_time,
      String(data.created_at ?? punchedAt.toISOString()),
    );

    const riskFlags = Array.isArray(riskApplied.row.risk_flags)
      ? (riskApplied.row.risk_flags as string[])
      : [];
    const warning =
      riskFlags.includes("device_mismatch")
        ? {
            warning_code: "DEVICE_MISMATCH",
            warning_message:
              "Clock-out device differs from clock-in. Your manager may review this punch.",
          }
        : riskApplied.row.device_trust_status === "new_device" || riskFlags.includes("new_device")
          ? {
              warning_code: "NEW_DEVICE",
              warning_message: "New device detected. Your manager may review this punch.",
            }
          : null;

    return NextResponse.json({
      ok: true,
      id: data.id,
      event_date,
      event_time: displayTime,
      photo_proof_used: true,
      verification_method: "photo_proof",
      review_required: true,
      action_type: punchAction,
      missing_rest_in: missingRestIn,
      server_created_at: punchedAt.toISOString(),
      ...(warning ?? {}),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
