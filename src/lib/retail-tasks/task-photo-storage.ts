import { malaysiaDateYmd } from "@/lib/malaysia-time";

export const TASK_PROOF_BUCKET = "retail-task-proofs";
export const TASK_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const TASK_PROOF_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function buildTaskProofStoragePath(
  companyId: string,
  shopId: string,
  taskId: string,
  staffId: string,
  at: Date = new Date(),
  variant: "original" | "display" = "display",
): string {
  const day = malaysiaDateYmd(at);
  const ts = at.getTime();
  const suffix = variant === "original" ? "-original.jpg" : "-display.jpg";
  return `${companyId}/${shopId}/${taskId}/${staffId}/${day}/${ts}${suffix}`;
}

/** @deprecated Use buildTaskProofStoragePath with variant. */
export function buildTaskProofStoragePathLegacy(
  companyId: string,
  shopId: string,
  taskId: string,
  staffId: string,
  at: Date = new Date(),
): string {
  const day = malaysiaDateYmd(at);
  const ts = at.getTime();
  return `${companyId}/${shopId}/${taskId}/${staffId}/${day}/${ts}.jpg`;
}

export function taskProofExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
