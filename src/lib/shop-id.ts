/** Normalize shop id from URL (decode, trim). */
export function normalizeShopId(raw: string | undefined | null): string {
  if (raw == null) return "";
  try {
    return decodeURIComponent(String(raw)).trim();
  } catch {
    return String(raw).trim();
  }
}

/** Loose UUID check — Supabase shop ids are UUIDs. */
export function isValidShopId(shopId: string): boolean {
  if (!shopId || shopId.length > 64) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    shopId,
  );
}
