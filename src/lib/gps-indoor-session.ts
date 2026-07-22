import { haversineDistanceMeters } from "@/lib/geo";
import type { GpsVerifyTier } from "@/lib/gps-shop-verify";

export const INDOOR_SESSION_TTL_MS = 30 * 60 * 1000;
export const INDOOR_SESSION_MAX_DRIFT_M = 150;

export type IndoorGpsSession = {
  shopId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  verifyTier: GpsVerifyTier;
  matchedLocationId: string | null;
  savedAt: number;
};

const STORAGE_PREFIX = "punch-indoor-gps-session-v1-";

function storageKey(shopId: string): string {
  return `${STORAGE_PREFIX}${shopId}`;
}

export function readIndoorGpsSession(shopId: string): IndoorGpsSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IndoorGpsSession;
    if (!parsed || parsed.shopId !== shopId) return null;
    if (Date.now() - parsed.savedAt > INDOOR_SESSION_TTL_MS) {
      localStorage.removeItem(storageKey(shopId));
      return null;
    }
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveIndoorGpsSession(session: IndoorGpsSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(session.shopId), JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearIndoorGpsSession(shopId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(shopId));
  } catch {
    /* ignore */
  }
}

export function indoorSessionDriftMeters(
  session: IndoorGpsSession,
  lat: number,
  lng: number,
): number {
  return haversineDistanceMeters(session.latitude, session.longitude, lat, lng);
}

export function isIndoorSessionUsable(
  session: IndoorGpsSession | null,
  lat: number,
  lng: number,
): session is IndoorGpsSession {
  if (!session) return false;
  return indoorSessionDriftMeters(session, lat, lng) <= INDOOR_SESSION_MAX_DRIFT_M;
}
