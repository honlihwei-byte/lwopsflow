/**
 * Indoor GPS failure counter (per shop + device + staff).
 * Photo proof unlocks after 3 failed verification rounds.
 */

import { getPunchDeviceId } from "@/lib/gps-indoor-trusted-device";

export const PHOTO_PROOF_MIN_FAILURES = 3;
export const PHOTO_PROOF_FAILURE_TTL_MS = 30 * 60 * 1000;

const STORAGE_PREFIX = "punch-indoor-fail-v2-";

export type IndoorVerifyAttempt = 1 | 2 | 3;

type FailureRecord = {
  count: number;
  updatedAt: number;
};

const listeners = new Set<() => void>();
const lastRecordedGpsRequestId = new Map<string, number>();

function scopeKey(shopId: string, staffId: string): string {
  const staff = staffId.trim() || "__none__";
  return `${shopId}-${getPunchDeviceId()}-${staff}`;
}

function storageKey(shopId: string, staffId: string): string {
  return `${STORAGE_PREFIX}${scopeKey(shopId, staffId)}`;
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function readRecord(shopId: string, staffId: string): FailureRecord {
  if (typeof localStorage === "undefined" || !shopId) {
    return { count: 0, updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(storageKey(shopId, staffId));
    if (!raw) return { count: 0, updatedAt: 0 };
    const parsed = JSON.parse(raw) as FailureRecord;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > PHOTO_PROOF_FAILURE_TTL_MS
    ) {
      return { count: 0, updatedAt: 0 };
    }
    return parsed;
  } catch {
    return { count: 0, updatedAt: 0 };
  }
}

function writeRecord(shopId: string, staffId: string, record: FailureRecord): void {
  if (typeof localStorage === "undefined" || !shopId) return;
  try {
    localStorage.setItem(storageKey(shopId, staffId), JSON.stringify(record));
  } catch {
    /* ignore */
  }
  notifyListeners();
}

/** Current attempt number (1–3) from prior failure count. */
export function indoorVerifyAttemptFromFailureCount(failureCount: number): IndoorVerifyAttempt {
  return Math.min(Math.max(failureCount, 0) + 1, 3) as IndoorVerifyAttempt;
}

export function indoorVerifyAttemptLabel(failureCount: number): string {
  const attempt = indoorVerifyAttemptFromFailureCount(failureCount);
  if (attempt === 1) return "Attempt 1/3 — Normal GPS";
  if (attempt === 2) return "Attempt 2/3 — Indoor radius ×1.5";
  return "Attempt 3/3 — Indoor radius ×2.0";
}

export function getIndoorVerifyFailureCount(shopId: string, staffId: string): number {
  return readRecord(shopId, staffId).count;
}

export function resetIndoorVerifyFailures(shopId: string, staffId: string): void {
  if (!shopId) return;
  lastRecordedGpsRequestId.delete(scopeKey(shopId, staffId));
  writeRecord(shopId, staffId, { count: 0, updatedAt: Date.now() });
}

/** One increment per GPS verify request when indoor punch is still not allowed. */
export function recordIndoorVerifyFailure(
  shopId: string,
  staffId: string,
  gpsRequestId: number,
): void {
  if (!shopId) return;
  const scope = scopeKey(shopId, staffId);
  if (lastRecordedGpsRequestId.get(scope) === gpsRequestId) return;
  lastRecordedGpsRequestId.set(scope, gpsRequestId);

  const prev = readRecord(shopId, staffId);
  writeRecord(shopId, staffId, {
    count: prev.count + 1,
    updatedAt: Date.now(),
  });
}

export function subscribeIndoorVerifyFailures(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getIndoorVerifyFailureSnapshot(shopId: string, staffId: string): number {
  return getIndoorVerifyFailureCount(shopId, staffId);
}
