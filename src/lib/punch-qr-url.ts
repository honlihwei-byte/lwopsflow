/** Client-safe clock URL builder (no Node crypto). */

import { buildClockPageUrl } from "@/lib/clock-routes";

export function buildClockUrlWithToken(shopId: string, token: string): string {
  return buildClockPageUrl(shopId, token);
}

export function normalizePunchQrToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.length > 128) return null;
  return t;
}
