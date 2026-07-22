import { parseStaffGps } from "@/lib/attendance-punch";
import {
  checkGpsAgainstLocations,
  type ShopGpsLocation,
} from "@/lib/gps-shop-verify";
import { listShopGpsLocations, type ShopGpsLocationRow } from "@/lib/shop-gps-locations";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type TaskGpsResult = {
  gps_lat: number;
  gps_lng: number;
  gps_distance_meters: number;
  gps_status: string;
};

function rowToLocation(row: ShopGpsLocationRow): ShopGpsLocation {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    allowed_radius_meters: row.allowed_radius_meters,
    location_type: row.location_type,
  };
}

export async function verifyTaskGps(
  supabase: Supabase,
  shopId: string,
  body: Record<string, unknown>,
  context?: { task_id?: string },
): Promise<TaskGpsResult | { error: string; code?: string }> {
  const parsed = parseStaffGps(body);
  if (!parsed.ok) {
    console.warn("[task-gps]", {
      task_id: context?.task_id ?? null,
      validation_stage: "server_verify",
      gps_status: "missing_coordinates",
      location_permission: "unknown",
      coordinates: null,
      error: parsed.error,
    });
    return {
      error: "GPS verification required before submission.",
      code: "gps_required",
    };
  }

  const rows = await listShopGpsLocations(supabase, shopId, true);
  if (rows.length === 0) {
    return {
      gps_lat: parsed.lat,
      gps_lng: parsed.lng,
      gps_distance_meters: 0,
      gps_status: "manual_review",
    };
  }

  const locations = rows.map(rowToLocation);
  const check = checkGpsAgainstLocations(
    locations,
    parsed.lat,
    parsed.lng,
    parsed.accuracyM,
    { shopIndoorMode: false },
  );

  const gps_status = check.gpsVerified
    ? "approved"
    : check.verifyTier === "weak_indoor"
      ? "weak"
      : check.reviewRequired
        ? "manual_review"
        : "failed";

  console.info("[task-gps]", {
    task_id: context?.task_id ?? null,
    validation_stage: "server_verify",
    gps_status,
    location_permission: "unknown",
    coordinates: { lat: parsed.lat, lng: parsed.lng, accuracy_m: parsed.accuracyM },
  });

  return {
    gps_lat: parsed.lat,
    gps_lng: parsed.lng,
    gps_distance_meters: check.distanceM,
    gps_status,
  };
}
