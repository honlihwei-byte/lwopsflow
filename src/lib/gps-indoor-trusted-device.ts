/**
 * Per-device trust for indoor radius fallback (same shop, 30-minute window).
 * Counts standard (non-fallback) successful verifications on this browser.
 */

export const TRUSTED_DEVICE_WINDOW_MS = 30 * 60 * 1000;
export const TRUSTED_DEVICE_MIN_SUCCESSES = 3;

const DEVICE_ID_KEY = "punch-device-id-v1";
const TRUST_PREFIX = "punch-trusted-verify-v1-";

export type TrustedVerifyRecord = {
  deviceId: string;
  shopId: string;
  /** Standard verify successes (score ≥ 60, not expanded-radius fallback). */
  successesAt: number[];
};

export type TrustedFallbackEligibility = {
  eligible: boolean;
  deviceId: string;
  successCountInWindow: number;
  windowExpiresAt: number | null;
};

function trustStorageKey(shopId: string): string {
  return `${TRUST_PREFIX}${shopId}`;
}

/** Stable browser device id for audit + trust counting. */
export function getPunchDeviceId(): string {
  if (typeof localStorage === "undefined") return "unknown";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function readTrustRecord(shopId: string): TrustedVerifyRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(trustStorageKey(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrustedVerifyRecord;
    if (!parsed || parsed.shopId !== shopId || !Array.isArray(parsed.successesAt)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function pruneSuccesses(successesAt: number[], now = Date.now()): number[] {
  const cutoff = now - TRUSTED_DEVICE_WINDOW_MS;
  return successesAt.filter((t) => t >= cutoff).sort((a, b) => a - b);
}

export function recordTrustedVerification(shopId: string): TrustedVerifyRecord {
  const deviceId = getPunchDeviceId();
  const now = Date.now();
  const existing = readTrustRecord(shopId);
  const successesAt = pruneSuccesses(
    [...(existing?.successesAt ?? []), now],
    now,
  );
  const record: TrustedVerifyRecord = { deviceId, shopId, successesAt };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(trustStorageKey(shopId), JSON.stringify(record));
    } catch {
      /* ignore */
    }
  }
  return record;
}

export function getTrustedFallbackEligibility(shopId: string): TrustedFallbackEligibility {
  const deviceId = getPunchDeviceId();
  const record = readTrustRecord(shopId);
  const now = Date.now();
  const successesAt = pruneSuccesses(record?.successesAt ?? [], now);
  const successCountInWindow = successesAt.length;
  const eligible = successCountInWindow >= TRUSTED_DEVICE_MIN_SUCCESSES;
  const windowExpiresAt =
    successesAt.length > 0
      ? successesAt[0]! + TRUSTED_DEVICE_WINDOW_MS
      : null;

  return {
    eligible,
    deviceId,
    successCountInWindow,
    windowExpiresAt,
  };
}

export function clearTrustedVerifications(shopId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(trustStorageKey(shopId));
  } catch {
    /* ignore */
  }
}
