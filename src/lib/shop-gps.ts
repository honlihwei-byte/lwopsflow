import { isValidLatitude, isValidLongitude, parseCoord } from "@/lib/geo";

export type ShopGpsFields = {
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  gps_indoor_mode: boolean;
  allow_photo_proof_fallback: boolean;
};

export function parseGpsIndoorModeFromBody(body: Record<string, unknown>): boolean {
  return body.gps_indoor_mode === true;
}

export function parsePhotoProofFallbackFromBody(body: Record<string, unknown>): boolean {
  return body.allow_photo_proof_fallback === true;
}

export function shopGpsFromBody(body: Record<string, unknown>): {
  ok: true;
  value: ShopGpsFields;
} | {
  ok: false;
  error: string;
} {
  const lat = parseCoord(body.latitude);
  const lng = parseCoord(body.longitude);
  const radiusRaw = body.allowed_radius_meters;

  let allowed_radius_meters = 50;
  if (radiusRaw !== undefined && radiusRaw !== null && radiusRaw !== "") {
    const r = typeof radiusRaw === "number" ? radiusRaw : Number(String(radiusRaw).trim());
    if (!Number.isFinite(r) || r <= 0 || r > 50_000) {
      return { ok: false, error: "allowed_radius_meters must be between 1 and 50000" };
    }
    allowed_radius_meters = Math.round(r);
  }

  const gps_indoor_mode = parseGpsIndoorModeFromBody(body);
  const allow_photo_proof_fallback = parsePhotoProofFallbackFromBody(body);

  if (lat === null && lng === null) {
    return {
      ok: true,
      value: {
        latitude: null,
        longitude: null,
        allowed_radius_meters,
        gps_indoor_mode,
        allow_photo_proof_fallback,
      },
    };
  }
  if (lat === null || lng === null) {
    return { ok: false, error: "latitude and longitude must both be set or both empty" };
  }
  if (!isValidLatitude(lat)) {
    return { ok: false, error: "latitude must be between -90 and 90" };
  }
  if (!isValidLongitude(lng)) {
    return { ok: false, error: "longitude must be between -180 and 180" };
  }

  return {
    ok: true,
    value: {
      latitude: lat,
      longitude: lng,
      allowed_radius_meters,
      gps_indoor_mode,
      allow_photo_proof_fallback,
    },
  };
}

export const SHOP_GPS_SELECT =
  "id, name, gps_indoor_mode, allow_photo_proof_fallback, latitude, longitude, allowed_radius_meters, punch_qr_token, created_at, updated_at" as const;
