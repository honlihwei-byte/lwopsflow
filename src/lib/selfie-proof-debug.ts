export type SelfieUploadStatus =
  | "none"
  | "pending"
  | "uploaded"
  | "failed"
  | "not_required";

export function selfieProofDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" &&
      (window as unknown as { __SELFIE_DEBUG?: boolean }).__SELFIE_DEBUG === true)
  );
}

/** User-requested pipeline logs (always in development). */
export function logSelfiePipeline(
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!selfieProofDebugEnabled()) return;
  if (detail) {
    console.log(message, detail);
  } else {
    console.log(message);
  }
}

export function selfieProofDebugLog(
  label: string,
  data?: Record<string, unknown>,
): void {
  if (!selfieProofDebugEnabled()) return;
  if (data) {
    console.log(`[selfie-proof] ${label}`, data);
  } else {
    console.log(`[selfie-proof] ${label}`);
  }
}

/** @deprecated use logSelfiePipeline / logSelfieCaptured helpers */
export function selfiePunchPipelineLog(
  label: string,
  data?: Record<string, unknown>,
): void {
  selfieProofDebugLog(label, data);
}

export function logSelfieCaptured(): void {
  if (!selfieProofDebugEnabled()) return;
  console.log("Selfie captured");
}

export function logSelfieOriginalSize(bytes: number): void {
  if (!selfieProofDebugEnabled()) return;
  console.log("Original size", bytes);
}

export function logSelfieCompressedSize(bytes: number): void {
  if (!selfieProofDebugEnabled()) return;
  console.log("Compressed size", bytes);
}
