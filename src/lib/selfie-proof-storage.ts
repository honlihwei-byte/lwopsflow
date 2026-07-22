import { malaysiaDateYmd } from "@/lib/malaysia-time";

export const SELFIE_PROOF_BUCKET = "attendance-selfies";
export const SELFIE_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const SELFIE_PROOF_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type SelfieProofStoragePath = {
  path: string;
  filename: string;
};

/** company_id/shop_id/staff_id/yyyy-mm-dd/timestamp.jpg */
export function buildSelfieProofStoragePath(
  companyId: string,
  shopId: string,
  staffId: string,
  _actionType: "clock_in" | "clock_out",
  at: Date = new Date(),
): SelfieProofStoragePath {
  const day = malaysiaDateYmd(at);
  const ts = at.getTime();
  const filename = `${ts}.jpg`;
  const path = `${companyId}/${shopId}/${staffId}/${day}/${filename}`;
  return { path, filename };
}

export function selfieProofExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
