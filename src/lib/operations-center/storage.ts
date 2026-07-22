import { randomUUID } from "crypto";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

export const OPERATIONS_CONTENT_BUCKET = "operations-content";
export const OPERATIONS_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const OPERATIONS_PROOF_MAX_BYTES = 5 * 1024 * 1024;

export const OPERATIONS_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const OPERATIONS_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const OPERATIONS_INLINE_PREVIEW_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const SIGNED_PREVIEW_TTL_SEC = 3600;

export function operationsAttachmentExtension(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "application/msword") return "doc";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("spreadsheetml")) return "xlsx";
  return "jpg";
}

export function buildOperationsAttachmentPath(
  companyId: string,
  contentId: string,
  mimeType: string,
  originalName?: string,
): string {
  const ext = operationsAttachmentExtension(mimeType);
  const safeName = (originalName ?? "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
  return `${companyId}/${contentId}/attachments/${randomUUID()}-${safeName}.${ext}`;
}

export function buildOperationsPhotoProofPath(
  companyId: string,
  contentId: string,
  staffId: string,
  mimeType: string,
): string {
  const ext = operationsAttachmentExtension(mimeType);
  const day = malaysiaDateYmd(new Date());
  return `${companyId}/${contentId}/proofs/${staffId}/${day}/${Date.now()}.${ext}`;
}

export function isInlinePreviewMime(mime: string): boolean {
  return OPERATIONS_INLINE_PREVIEW_MIME_TYPES.has(mime.toLowerCase());
}

/** @deprecated use isInlinePreviewMime */
export function isPreviewableMime(mime: string): boolean {
  return isInlinePreviewMime(mime);
}
