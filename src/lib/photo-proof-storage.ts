import { malaysiaDateYmd } from "@/lib/malaysia-time";

export const PHOTO_PROOF_BUCKET = "attendance-proofs";
export const PHOTO_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_PROOF_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type PhotoProofStoragePath = {
  path: string;
  filename: string;
};

/** shop_id/staff_id/YYYY-MM-DD/timestamp-pending.jpg (before punch action chosen) */
export function buildPhotoProofStagingPath(
  shopId: string,
  staffId: string,
  at: Date = new Date(),
): PhotoProofStoragePath {
  const day = malaysiaDateYmd(at);
  const ts = at.getTime();
  const filename = `${ts}-pending.jpg`;
  const path = `${shopId}/${staffId}/${day}/${filename}`;
  return { path, filename };
}

/** shop_id/staff_id/YYYY-MM-DD/timestamp-action.jpg */
/** shop_id/staff_id/random-selfie/timestamp.jpg */
export function buildRandomSelfieStoragePath(
  shopId: string,
  staffId: string,
  at: Date = new Date(),
): PhotoProofStoragePath {
  const ts = at.getTime();
  const filename = `${ts}-selfie.jpg`;
  const path = `${shopId}/${staffId}/random-selfie/${filename}`;
  return { path, filename };
}

export function buildPhotoProofStoragePath(
  shopId: string,
  staffId: string,
  actionType: "clock_in" | "clock_out",
  at: Date = new Date(),
): PhotoProofStoragePath {
  const day = malaysiaDateYmd(at);
  const ts = at.getTime();
  const filename = `${ts}-${actionType}.jpg`;
  const path = `${shopId}/${staffId}/${day}/${filename}`;
  return { path, filename };
}

export function photoProofExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
