import { formatMalaysiaRecordedAt } from "@/lib/malaysia-time";
import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";

export function normalizePhotoRecord(
  raw: unknown,
  fallbackCapturedAt?: string | null,
): TaskProofPhotoRecord | null {
  if (typeof raw === "string") {
    const path = raw.trim();
    if (!path) return null;
    return {
      original_path: path,
      display_path: path,
      captured_at: fallbackCapturedAt ?? "",
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const display_path = String(row.display_path ?? row.photo_url ?? "").trim();
  const original_path = String(row.original_path ?? display_path).trim();
  if (!display_path) return null;
  return {
    original_path: original_path || display_path,
    display_path,
    captured_at: String(row.captured_at ?? fallbackCapturedAt ?? ""),
  };
}

export function normalizePhotoRecords(
  raw: unknown,
  fallbackCapturedAt?: string | null,
): TaskProofPhotoRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePhotoRecord(item, fallbackCapturedAt))
    .filter((x): x is TaskProofPhotoRecord => x != null);
}

export function taskProofDisplayPath(photo: TaskProofPhotoRecord): string {
  return photo.display_path;
}

export function taskProofPhotoPaths(photos: TaskProofPhotoRecord[]): string[] {
  return photos.map(taskProofDisplayPath);
}

export function formatTaskProofPhotoTimestamp(capturedAt: string | null | undefined): string {
  if (!capturedAt) return "—";
  return formatMalaysiaRecordedAt(capturedAt);
}

export function parsePhotoRecordsFromBody(body: Record<string, unknown>): TaskProofPhotoRecord[] {
  if (!Array.isArray(body.photo_urls)) return [];
  return normalizePhotoRecords(body.photo_urls);
}
