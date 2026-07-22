/**
 * Canonical clock page paths for QR codes and redirects.
 * Primary route: /shop/{shopId}/clock
 * Legacy alias:  /clock/{shopId}  (same page, no redirect required)
 */

import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/app-url";

export const CLOCK_ROUTE = {
  /** Path segment after origin — `/shop/[shopId]/clock` */
  canonical: (shopId: string) => `/shop/${encodeURIComponent(shopId)}/clock`,
  /** Legacy QR path — still served by app/clock/[shopId] */
  legacy: (shopId: string) => `/clock/${encodeURIComponent(shopId)}`,
} as const;

/**
 * Origin embedded in shop clock QR codes.
 * Production always uses https://lwopsflow.com — never VERCEL_URL or *.vercel.app.
 */
export function getQrCodeBaseUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return getAppBaseUrl();
  }
  return DEFAULT_APP_BASE_URL;
}

/** @deprecated Use getQrCodeBaseUrl — kept for callers expecting "public origin". */
export function getPublicAppOrigin(): string {
  return getQrCodeBaseUrl();
}

export function buildClockPageUrl(
  shopId: string,
  punchQrToken?: string | null,
): string {
  const base = getQrCodeBaseUrl();
  const path = CLOCK_ROUTE.canonical(shopId);
  const url = `${base}${path}`;
  if (!punchQrToken?.trim()) return url;
  const qs = new URLSearchParams({ t: punchQrToken.trim() });
  return `${url}?${qs.toString()}`;
}

/** Match pathname to shop id for catch-all / invalid-QR handling. */
export function parseShopIdFromClockPath(pathname: string): string | null {
  const p = pathname.replace(/\/$/, "") || "/";
  const patterns = [
    /^\/shop\/([^/]+)\/clock$/i,
    /^\/clock\/([^/]+)$/i,
    /^\/shops\/([^/]+)\/clock$/i,
    /^\/shops\/([^/]+)$/i,
    /^\/shop\/([^/]+)$/i,
  ];
  for (const re of patterns) {
    const m = p.match(re);
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1]).trim();
      } catch {
        return m[1].trim();
      }
    }
  }
  return null;
}
