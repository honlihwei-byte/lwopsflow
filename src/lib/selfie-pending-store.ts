/** Persist pending selfie blobs on the clock device for background retry. */

const KEY_PREFIX = "opsflow-selfie-pending:";

export type PendingSelfiePayload = {
  attendanceId: string;
  shopId: string;
  punchQrToken: string;
  staffId?: string;
  staffIdentifier?: string;
  savedAt: string;
  mime: string;
  base64: string;
};

function storageKey(attendanceId: string): string {
  return `${KEY_PREFIX}${attendanceId}`;
}

export async function savePendingSelfieUpload(
  params: Omit<PendingSelfiePayload, "savedAt" | "mime" | "base64"> & { file: File },
): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  const buf = await params.file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const payload: PendingSelfiePayload = {
    attendanceId: params.attendanceId,
    shopId: params.shopId,
    punchQrToken: params.punchQrToken,
    staffId: params.staffId,
    staffIdentifier: params.staffIdentifier,
    savedAt: new Date().toISOString(),
    mime: params.file.type || "image/jpeg",
    base64: btoa(binary),
  };
  sessionStorage.setItem(storageKey(params.attendanceId), JSON.stringify(payload));
}

export function loadPendingSelfieUpload(attendanceId: string): PendingSelfiePayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(storageKey(attendanceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSelfiePayload;
  } catch {
    return null;
  }
}

export function listPendingSelfieUploadIds(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  const ids: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    ids.push(key.slice(KEY_PREFIX.length));
  }
  return ids;
}

export function clearPendingSelfieUpload(attendanceId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(storageKey(attendanceId));
}

export function pendingSelfieToFile(payload: PendingSelfiePayload): File {
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], "selfie.jpg", {
    type: payload.mime || "image/jpeg",
    lastModified: Date.now(),
  });
}
