/** Remove characters invalid on common filesystems; collapse whitespace to hyphens. */
export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Split a retail shop label into code + display name.
 * Supports names like "TT10 Tataa Friends", "MS04 - Sorella", "PG83: Pierre Cardin".
 */
export function splitShopCodeAndName(
  shopName: string,
  shopCode?: string | null,
): { code: string; name: string } {
  const explicit = shopCode?.trim();
  if (explicit) {
    return { code: explicit, name: shopName.trim() || explicit };
  }

  const trimmed = shopName.trim();
  if (!trimmed) return { code: "", name: "" };

  const alphaNumCode = trimmed.match(/^([A-Za-z]{1,4}\d{2,6})\s*[-–—:,]?\s*(.+)$/);
  if (alphaNumCode) {
    return { code: alphaNumCode[1]!.toUpperCase(), name: alphaNumCode[2]!.trim() };
  }

  const dashed = trimmed.match(/^([A-Za-z0-9]{2,12})\s*[-–—]\s*(.+)$/);
  if (dashed) {
    return { code: dashed[1]!, name: dashed[2]!.trim() };
  }

  return { code: "", name: trimmed };
}

/** Filename base (no extension) for a shop clock QR asset. */
export function buildShopClockQrFilenameBase(params: {
  shopCode?: string | null;
  shopName: string;
}): string {
  const { code, name } = splitShopCodeAndName(params.shopName, params.shopCode);
  const codePart = code ? sanitizeFilenamePart(code) : "";
  const namePart = sanitizeFilenamePart(name || params.shopName);
  if (!codePart) return `${namePart || "Shop"}-Clock-QR`;
  if (!namePart || namePart.toUpperCase() === codePart.toUpperCase()) {
    return `${codePart}-Clock-QR`;
  }
  return `${codePart}-${namePart}-Clock-QR`;
}

export function shopClockQrDownloadFilename(
  params: { shopCode?: string | null; shopName: string },
  ext: "jpg" | "png" | "svg",
): string {
  return `${buildShopClockQrFilenameBase(params)}.${ext}`;
}

/** One shop entry for a future bulk "Download All QR" ZIP export. */
export type ShopClockQrZipExportItem = {
  shopCode?: string | null;
  shopName: string;
  clockUrl: string;
};

/** ZIP entry path inside a future bulk clock-QR archive. */
export function shopClockQrZipEntryName(
  item: Pick<ShopClockQrZipExportItem, "shopCode" | "shopName">,
  ext: "jpg" | "png" | "svg",
): string {
  return shopClockQrDownloadFilename(item, ext);
}

export type ShopClockQrZipExportManifest = {
  shops: ShopClockQrZipExportItem[];
};
