/** Short-lived in-memory cache for operations dashboard (per server instance). */
const TTL_MS = 45_000;

type CacheEntry = { at: number; data: unknown };

const store = new Map<string, CacheEntry>();

export function getOperationsDashboardCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setOperationsDashboardCache(key: string, data: unknown): void {
  store.set(key, { at: Date.now(), data });
}

export function operationsDashboardCacheKey(companyId: string, view: string): string {
  return `ops:${companyId}:${view}`;
}
