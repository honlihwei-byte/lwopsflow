import { GPS_LOCATIONS_TABLE_MISSING_MSG, isPostgrestMissingTable } from "@/lib/api-error";
import { isValidLatitude, isValidLongitude, parseCoord } from "@/lib/geo";
import type { ShopGpsLocationType } from "@/lib/gps-shop-verify";
import type { createAdminClient } from "@/lib/supabase/admin";

export const SHOP_GPS_LOCATION_TYPES: ShopGpsLocationType[] = [
  "main",
  "office",
  "parking",
  "loading",
  "backup",
];

export const SHOP_GPS_LOCATION_TYPE_LABELS: Record<ShopGpsLocationType, string> = {
  main: "Main",
  office: "Office",
  parking: "Parking",
  loading: "Loading",
  backup: "Backup",
};

export const HIGH_RISE_GPS_TIP =
  "Optional: add extra GPS points (e.g. office floor, parking) for high-rise buildings. Main shop GPS on Edit is always required for clock-in.";

export class GpsLocationsTableMissingError extends Error {
  constructor() {
    super(GPS_LOCATIONS_TABLE_MISSING_MSG);
    this.name = "GpsLocationsTableMissingError";
  }
}

export type ShopGpsLocationRow = {
  id: string;
  shop_id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  location_type: ShopGpsLocationType;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export const SHOP_GPS_LOCATION_SELECT =
  "id, shop_id, name, latitude, longitude, allowed_radius_meters, location_type, is_active, sort_order, created_at, updated_at" as const;

type Supabase = ReturnType<typeof createAdminClient>;

export function isShopGpsLocationType(v: string): v is ShopGpsLocationType {
  return (SHOP_GPS_LOCATION_TYPES as string[]).includes(v);
}

export function formatVerifiedViaLabel(locationName: string): string {
  const trimmed = locationName.trim();
  return trimmed ? `Verified via ${trimmed}` : "Location verified";
}

export function shopGpsLocationFromBody(body: Record<string, unknown>): {
  ok: true;
  value: {
    name: string;
    latitude: number;
    longitude: number;
    allowed_radius_meters: number;
    location_type: ShopGpsLocationType;
    is_active: boolean;
    sort_order: number | null;
  };
} | { ok: false; error: string } {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };

  const lat = parseCoord(body.latitude);
  const lng = parseCoord(body.longitude);
  if (lat === null || lng === null) {
    return { ok: false, error: "latitude and longitude are required" };
  }
  if (!isValidLatitude(lat)) return { ok: false, error: "latitude must be between -90 and 90" };
  if (!isValidLongitude(lng)) return { ok: false, error: "longitude must be between -180 and 180" };

  const radiusRaw = body.allowed_radius_meters;
  let allowed_radius_meters = 50;
  if (radiusRaw !== undefined && radiusRaw !== null && radiusRaw !== "") {
    const r = typeof radiusRaw === "number" ? radiusRaw : Number(String(radiusRaw).trim());
    if (!Number.isFinite(r) || r <= 0 || r > 50_000) {
      return { ok: false, error: "allowed_radius_meters must be between 1 and 50000" };
    }
    allowed_radius_meters = Math.round(r);
  }

  const typeRaw = String(body.location_type ?? "main").trim();
  if (!isShopGpsLocationType(typeRaw)) {
    return { ok: false, error: "Invalid location_type" };
  }

  const is_active = body.is_active === false ? false : true;

  let sort_order: number | null = null;
  if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== "") {
    const s = typeof body.sort_order === "number" ? body.sort_order : Number(String(body.sort_order).trim());
    if (!Number.isFinite(s)) return { ok: false, error: "sort_order must be a number" };
    sort_order = Math.round(s);
  }

  return {
    ok: true,
    value: {
      name,
      latitude: lat,
      longitude: lng,
      allowed_radius_meters,
      location_type: typeRaw,
      is_active,
      sort_order,
    },
  };
}

export async function listShopGpsLocations(
  supabase: Supabase,
  shopId: string,
  activeOnly = false,
): Promise<ShopGpsLocationRow[]> {
  let q = supabase
    .from("shop_gps_locations")
    .select(SHOP_GPS_LOCATION_SELECT)
    .eq("shop_id", shopId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    if (isPostgrestMissingTable(error)) throw new GpsLocationsTableMissingError();
    throw error;
  }
  return (data ?? []) as ShopGpsLocationRow[];
}

export async function nextSortOrder(supabase: Supabase, shopId: string): Promise<number> {
  const { data, error } = await supabase
    .from("shop_gps_locations")
    .select("sort_order")
    .eq("shop_id", shopId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isPostgrestMissingTable(error)) throw new GpsLocationsTableMissingError();
    throw error;
  }
  return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
}
