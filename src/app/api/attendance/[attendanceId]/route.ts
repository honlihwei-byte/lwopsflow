import { NextResponse } from "next/server";
import { applyAttendanceEnrichUpdate } from "@/lib/attendance-enrich-db";
import {
  buildEnrichAuditNotes,
  computeTimeDifferenceSeconds,
} from "@/lib/attendance-enrich";
import {
  attendanceGpsFieldsFromCheck,
  buildGpsVerifyContext,
  checkGpsAgainstLocations,
  GPS_WEAK_ACCURACY_THRESHOLD_M,
  loadShopForPunch,
  parsePunchGpsExtras,
  parseStaffGps,
} from "@/lib/attendance-punch";
import { parseCoord } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";

/** Background GPS refinement or delayed audit enrichment after fast punch. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ attendanceId: string }> },
) {
  const { attendanceId } = await ctx.params;
  try {
    const body = await req.json();
    const shopId = body.shop_id as string | undefined;
    const mode = String(body.mode ?? "refine");

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing, error: loadErr } = await supabase
      .from("attendance")
      .select(
        "id, shop_id, staff_latitude, staff_longitude, gps_accuracy_meters, original_staff_latitude, server_created_at, created_at",
      )
      .eq("id", attendanceId)
      .maybeSingle();

    if (loadErr) {
      console.error(loadErr);
      return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
    if (existing.shop_id !== shopId) {
      return NextResponse.json({ error: "Shop mismatch" }, { status: 400 });
    }

    if (mode === "enrich") {
      const accuracyRaw = parseCoord(body.gps_accuracy_meters);
      const accuracyM =
        accuracyRaw !== null && Number.isFinite(accuracyRaw) && accuracyRaw >= 0
          ? Math.round(accuracyRaw * 100) / 100
          : null;

      const clientDeviceTime =
        typeof body.client_device_time === "string" && body.client_device_time.trim()
          ? body.client_device_time.trim()
          : null;

      const serverTs = String(
        existing.server_created_at ?? existing.created_at ?? new Date().toISOString(),
      );

      const updates: Record<string, unknown> = {
        last_updated_at: new Date().toISOString(),
      };

      if (accuracyM != null) {
        updates.gps_accuracy_meters = accuracyM;
      }
      if (clientDeviceTime) {
        updates.client_device_time = clientDeviceTime;
        const diff = computeTimeDifferenceSeconds(clientDeviceTime, serverTs);
        if (diff != null) updates.time_difference_seconds = diff;
      }

      const weakGps =
        accuracyM != null && accuracyM > GPS_WEAK_ACCURACY_THRESHOLD_M;
      updates.audit_notes =
        typeof body.audit_notes === "string" && body.audit_notes.trim()
          ? body.audit_notes.trim()
          : buildEnrichAuditNotes({ accuracyMeters: accuracyM, weakGps });

      const enrichResult = await applyAttendanceEnrichUpdate(supabase, attendanceId, updates);
      if (!enrichResult.ok) {
        console.error(enrichResult.error);
        return NextResponse.json({ error: "Failed to enrich attendance" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, enriched: true });
    }

    const gpsParsed = parseStaffGps(body as Record<string, unknown>);
    if (!gpsParsed.ok) {
      return NextResponse.json({ error: gpsParsed.error }, { status: 400 });
    }

    const shopResult = await loadShopForPunch(supabase, shopId);
    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }

    const extras = parsePunchGpsExtras(body as Record<string, unknown>);
    const gps = checkGpsAgainstLocations(
      shopResult.shop.locations,
      gpsParsed.lat,
      gpsParsed.lng,
      gpsParsed.accuracyM,
      buildGpsVerifyContext(shopResult.shop, extras),
    );

    const currentAccuracy = existing.gps_accuracy_meters as number | null;
    if (
      currentAccuracy != null &&
      gpsParsed.accuracyM != null &&
      gpsParsed.accuracyM >= currentAccuracy
    ) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not_more_accurate" });
    }

    const fields = attendanceGpsFieldsFromCheck(
      { ...gps, gpsAccuracyMeters: gpsParsed.accuracyM },
      gpsParsed.accuracyM,
    );
    const updates: Record<string, unknown> = {
      ...fields,
      gps_corrected_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    };

    if (existing.original_staff_latitude == null) {
      updates.original_staff_latitude = existing.staff_latitude;
      updates.original_staff_longitude = existing.staff_longitude;
      updates.original_gps_accuracy_meters = existing.gps_accuracy_meters;
    }

    const { error: updateErr } = await supabase
      .from("attendance")
      .update(updates)
      .eq("id", attendanceId);

    if (updateErr) {
      console.error(updateErr);
      return NextResponse.json({ error: "Failed to update GPS" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      gps_verified: fields.gps_verified,
      distance_from_shop_meters: fields.distance_from_shop_meters,
      gps_accuracy_meters: fields.gps_accuracy_meters,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
