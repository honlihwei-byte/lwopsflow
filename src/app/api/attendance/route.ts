import { NextResponse } from "next/server";
import type { PunchActionType } from "@/lib/attendance";
import { ATTENDANCE_FAST_PUNCH_SELECT } from "@/lib/attendance-db";
import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import {
  attendanceGpsFieldsFromCheck,
  buildGpsVerifyContext,
  checkGpsAgainstLocations,
  loadShopForPunch,
  parsePunchGpsExtras,
  parseStaffGps,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { assertEmployeeCanClockInAtShop } from "@/lib/employee-clock-shop-access";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { TOO_FAR_MSG } from "@/lib/gps-shop-verify";
import { punchBlockedMessage } from "@/lib/location-confidence";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { formatEventTimeDisplay } from "@/lib/malaysia-time";
import { isPunchTimingEnabled, punchTime, punchTimeStart } from "@/lib/punch-timing";
import { companyClockAllowed } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceSmartPunchOnServer } from "@/lib/smart-punch-server";
import { deviceMetaToInsertFields, punchDeviceMetaFromRequest } from "@/lib/punch-device-meta";
import { applyAntiBuddyFieldsToInsert } from "@/lib/punch-risk-insert";
import { verificationMethodForGpsPunch } from "@/lib/verification-method";

export async function POST(req: Request) {
  const totalStart = punchTimeStart();
  const timings: Record<string, number> = {};

  try {
    const body = await req.json();
    const shopId = body.shop_id as string | undefined;
    const actionType = body.action_type as string | undefined;
    const staffId = body.staff_id as string | undefined;
    const staffIdentifier = String(body.staff_identifier ?? "").trim();
    const fastPunch = body.fast_punch === true;

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

    const gpsParsed = parseStaffGps(body as Record<string, unknown>);
    if (!gpsParsed.ok) {
      return NextResponse.json({ error: gpsParsed.error }, { status: 400 });
    }

    const punchQrToken =
      normalizePunchQrToken(body.punch_qr_token) ?? normalizePunchQrToken(body.t);
    const employeeSession = employeeSessionFromRequest(req);
    const employeePortalPunch = Boolean(employeeSession);
    const effectiveStaffId = staffId?.trim() || employeeSession?.staffId || undefined;

    const { event_date, event_time } = buildAttendanceEventFields();
    const supabase = createAdminClient();

    const parallelStart = punchTimeStart();
    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: effectiveStaffId,
        staffIdentifier: employeeSession ? undefined : staffIdentifier || undefined,
        employeePortalShopAccess: employeePortalPunch,
      }),
    ]);
    timings.parallel_db_ms = punchTime("API parallel shop+staff", parallelStart);

    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if ("error" in staffResult) {
      return NextResponse.json(
        { error: staffResult.error, code: staffResult.code },
        { status: staffResult.status },
      );
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

    if (employeePortalPunch && employeeSession!.staffId === staffRow.id && actionType === "clock_in") {
      try {
        const scheduleCheck = await assertEmployeeCanClockInAtShop(supabase, {
          staff_id: staffRow.id,
          company_id: String(staffRow.company_id),
          shop_id: shopId,
        });
        if (!scheduleCheck.ok) {
          return NextResponse.json(
            { error: scheduleCheck.error, code: scheduleCheck.code },
            { status: 403 },
          );
        }
      } catch (e) {
        console.warn("[attendance] schedule check failed — allowing clock_in", e);
      }
    }

    if (shop.companyId) {
      const clockOk = await companyClockAllowed(supabase, shop.companyId);
      if (!clockOk) {
        return NextResponse.json(
          { error: "Subscription expired. Please contact your employer." },
          { status: 402 },
        );
      }
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

    if (fastPunch && body.gps_verified !== true) {
      return NextResponse.json(
        { error: "GPS must be verified before punch." },
        { status: 400 },
      );
    }

    const extras = parsePunchGpsExtras(body as Record<string, unknown>);
    const verifyContext = buildGpsVerifyContext(shop, extras);

    const distStart = punchTimeStart();
    const gps = checkGpsAgainstLocations(
      shop.locations,
      gpsParsed.lat,
      gpsParsed.lng,
      gpsParsed.accuracyM,
      verifyContext,
    );
    timings.distance_calc_ms = punchTime("Distance calculation", distStart);

    if (!gps.allowsPunch) {
      const gpsFields = attendanceGpsFieldsFromCheck(
        { ...gps, gpsAccuracyMeters: gpsParsed.accuracyM },
        gpsParsed.accuracyM,
      );
      return NextResponse.json(
        {
          error: shop.gpsIndoorMode
            ? punchBlockedMessage(gps.locationConfidenceScore)
            : TOO_FAR_MSG,
          gps_verified: false,
          gps_verify_tier: gpsFields.gps_verify_tier,
          location_confidence_score: gpsFields.location_confidence_score,
          distance_from_shop_meters: gpsFields.distance_from_shop_meters,
        },
        { status: 403 },
      );
    }

    const gpsFields = attendanceGpsFieldsFromCheck(
      { ...gps, gpsAccuracyMeters: gpsParsed.accuracyM },
      gpsParsed.accuracyM,
      { punchDeviceId: extras.punch_device_id },
    );

    const verificationMethod = verificationMethodForGpsPunch(
      shop.gpsIndoorMode === true,
      gpsFields.gps_indoor_fallback_used === true,
    );

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
      staff_latitude: gpsFields.staff_latitude,
      staff_longitude: gpsFields.staff_longitude,
      distance_from_shop_meters: gpsFields.distance_from_shop_meters,
      gps_accuracy_meters: gpsFields.gps_accuracy_meters,
      gps_verified: gpsFields.gps_verified,
      gps_verify_tier: gpsFields.gps_verify_tier,
      gps_sample_count: gpsFields.gps_sample_count,
      gps_sample_spread_meters: gpsFields.gps_sample_spread_meters,
      gps_indoor_session_used: gpsFields.gps_indoor_session_used,
      gps_review_required: gpsFields.gps_review_required,
      location_confidence_score: gpsFields.location_confidence_score,
      gps_indoor_fallback_used: gpsFields.gps_indoor_fallback_used,
      gps_original_radius_meters: gpsFields.gps_original_radius_meters,
      gps_expanded_radius_meters: gpsFields.gps_expanded_radius_meters,
      gps_trusted_window_used: gpsFields.gps_trusted_window_used,
      gps_radius_used_meters: gpsFields.gps_radius_used_meters,
      gps_confidence_label: gpsFields.gps_confidence_label,
      gps_verify_attempt: gpsFields.gps_verify_attempt,
      gps_result_reason: gpsFields.gps_result_reason,
      ...deviceMetaToInsertFields(
        punchDeviceMetaFromRequest({
          punch_device_id: extras.punch_device_id ?? gpsFields.punch_device_id,
          punch_browser_info: extras.punch_browser_info,
          punch_device_name: extras.punch_device_name,
          punch_os_name: extras.punch_os_name,
          punch_browser: extras.punch_browser,
          punch_platform: extras.punch_platform,
          punch_user_agent: extras.punch_user_agent,
        }),
      ),
      verification_method: verificationMethod,
      review_required:
        gpsFields.gps_review_required === true ||
        gpsFields.gps_indoor_fallback_used === true ||
        gpsFields.gps_verify_tier === "weak_indoor" ||
        gpsFields.gps_verify_tier === "review_required",
      ...(gpsFields.matched_gps_location_name
        ? {
            matched_gps_location_id: gpsFields.matched_gps_location_id ?? null,
            matched_gps_location_name: gpsFields.matched_gps_location_name,
            matched_gps_location_type: gpsFields.matched_gps_location_type ?? null,
          }
        : {}),
      ...(missingRestIn
        ? {
            missing_rest_in: true,
            needs_review: true,
            exception_type: "missing_rest_in",
          }
        : {}),
    };

    const deviceMeta = punchDeviceMetaFromRequest({
      punch_device_id: extras.punch_device_id ?? gpsFields.punch_device_id,
      punch_browser_info: extras.punch_browser_info,
      punch_device_name: extras.punch_device_name,
      punch_os_name: extras.punch_os_name,
      punch_browser: extras.punch_browser,
      punch_platform: extras.punch_platform,
      punch_user_agent: extras.punch_user_agent,
    });

    const riskApplied = await applyAntiBuddyFieldsToInsert(supabase, insertRow, {
      staffId: staffRow.id,
      shopId,
      companyId: shop.companyId,
      actionType: punchAction,
      deviceId: deviceMeta.punch_device_id,
      browserInfo: deviceMeta.punch_browser_info,
      gpsAccuracyM: gpsParsed.accuracyM,
      photoProofUsed: false,
      verificationMethod,
      randomSelfiePath: extras.random_selfie_path ?? null,
      selfieProofPath: extras.selfie_proof_path ?? null,
      selfieCapturedAt: extras.selfie_captured_at ?? null,
      selfieChallengeToken: extras.selfie_challenge_token ?? null,
      selfiePendingUpload: extras.selfie_pending_upload === true,
      existingReviewRequired: gpsFields.gps_review_required === true,
      deviceName: deviceMeta.punch_device_name,
      osName: deviceMeta.punch_os_name,
      eventDate: event_date,
      verifiedEmployeeIdentity,
    });
    if (riskApplied.error) {
      return NextResponse.json({ error: riskApplied.error }, { status: riskApplied.status ?? 400 });
    }
    insertRow = riskApplied.row;

    const insertStart = punchTimeStart();
    const { data, error } = await supabase
      .from("attendance")
      .insert(insertRow)
      .select(fastPunch ? ATTENDANCE_FAST_PUNCH_SELECT : ATTENDANCE_FAST_PUNCH_SELECT)
      .single();
    timings.supabase_insert_ms = punchTime("Supabase insert", insertStart);

    if (error || !data) {
      console.error(error);
      return NextResponse.json(
        {
          error: error?.message || "Failed to save attendance",
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        },
        { status: 500 },
      );
    }

    const displayTime = formatEventTimeDisplay(
      data.event_time != null ? String(data.event_time) : event_time,
      String(data.created_at ?? new Date().toISOString()),
    );

    timings.total_api_ms = punchTime("API total", totalStart);

    if (isPunchTimingEnabled()) {
      console.log("[punch-timing] server breakdown", timings);
    }

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
      gps_verified: true,
      location_confidence_score: gpsFields.location_confidence_score,
      gps_verify_tier: gpsFields.gps_verify_tier,
      distance_from_shop_meters: gpsFields.distance_from_shop_meters,
      action_type: punchAction,
      missing_rest_in: missingRestIn,
      ...(warning ?? {}),
      ...(isPunchTimingEnabled() ? { _timings: timings } : {}),
    });
  } catch (e) {
    punchTime("API total (error)", totalStart);
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
