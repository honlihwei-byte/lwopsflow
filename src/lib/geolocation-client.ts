import { aggregateGpsSamples, type AggregatedGpsPosition } from "@/lib/gps-aggregate";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { punchMark, punchTime, punchTimeStart } from "@/lib/punch-timing";

export type StaffPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type CachedGpsPosition = StaffPosition & {
  cachedAt: number;
  sampleCount?: number;
  sampleSpreadMeters?: number;
};

export type { AggregatedGpsPosition };

export type GpsAccuracyTier = "good" | "fair" | "weak" | "unknown";

export type LocationPrepareStatus = "preparing" | "ready" | "stale" | "error";

/** Prepared GPS valid for punch UI (45s — indoor fixes often arrive slowly). */
export const GPS_CACHE_TTL_MS = 45_000;
/** Reuse last good fix for punch when same device (5 min). */
export const GPS_PUNCH_REUSE_TTL_MS = 5 * 60 * 1000;
/** Display-only stale cache while a new fix is loading (page reopen / resume). */
export const GPS_DISPLAY_STALE_MAX_MS = 120_000;
/** Background refresh interval while page is open. */
export const GPS_REFRESH_INTERVAL_MS = 25_000;
/** Max time for clock-page location check (UI + prepare budget). */
export const GPS_MAX_CHECK_MS = 10_000;

/** Clock page: at most 3 GPS samples per check/refresh. */
export const GPS_CLOCK_MAX_SAMPLES = 3;

export const GPS_CHECKING_TIMEOUT_MSG =
  "Location is taking too long. Try Refresh Location or move near window.";

/** If prepare runs longer than this, force reset + retry (stuck geolocation). */
export const GPS_PREPARE_STUCK_MS = GPS_MAX_CHECK_MS;

export const GPS_GOOD_ACCURACY_M = 40;
export const GPS_FAIR_ACCURACY_M = 80;
export const GPS_WEAK_ACCURACY_METERS = 100;

export const GPS_WEAK_HINT =
  "GPS weak indoors — Wi-Fi helps. You can still punch; this punch is logged as Weak Indoor.";

export const GPS_WEAK_INDOOR_HINT =
  "Indoor GPS verified with reduced precision. Punch is allowed and flagged for audit.";

export const GPS_UNSTABLE_HINT =
  "GPS readings are shifting. Stay still and tap Refresh Location, or punch if already verified.";

const GPS_SAMPLE_BUFFER_MAX = GPS_CLOCK_MAX_SAMPLES;

/** Fast clock sample — getCurrentPosition only (no long watch). */
const CLOCK_SAMPLE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 3500,
  maximumAge: 20_000,
};

const CLOCK_SAMPLE2_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 4000,
  maximumAge: 5000,
};

export const GPS_INDOOR_HINT =
  "Getting location may take longer indoors. Please turn on Wi-Fi and Location.";

export const GPS_UNAVAILABLE_MSG = "Location unavailable";

const STORAGE_KEY = "punch-card-gps-cache-v3";

/** Stage 1: fast coarse fix (Android network / Wi-Fi). */
const STAGE1_COARSE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 2000,
  maximumAge: 20_000,
};

/** Stage 2: high-accuracy GPS when coarse is weak or failed. */
const STAGE2_HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 0,
};

/** Stage 3 samples: short timeout coarse reads for median. */
const STAGE3_SAMPLE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 2500,
  maximumAge: 5000,
};

let memoryCache: CachedGpsPosition | null = null;
let sampleBuffer: StaffPosition[] = [];
let prepareStatus: LocationPrepareStatus = "preparing";
let prepareError: string | null = null;
let prepareCycleInFlight: Promise<void> | null = null;
let prepareCycleStartedAt = 0;
let refreshTimer: number | null = null;
let staleCheckTimer: number | null = null;
let stuckWatchdogTimer: number | null = null;
let stateListeners = new Set<() => void>();
let prepareGeneration = 0;
let activeWatchIds: number[] = [];
let lifecycleInstalled = false;
let clockSamplingPaused = false;
let earlyStopListener: (() => boolean) | null = null;
let clockIndoorConfidenceMode = false;

/** Normal retail: single fast GPS read. Indoor: multi-sample + confidence. */
export function setClockGpsIndoorConfidenceMode(enabled: boolean): void {
  clockIndoorConfidenceMode = enabled;
  gpsLog("clock GPS mode", { indoorConfidence: enabled });
}

export function isClockGpsIndoorConfidenceMode(): boolean {
  return clockIndoorConfidenceMode;
}

/** Shorter budget for normal (non-indoor) shops. */
export const GPS_OUTDOOR_MAX_CHECK_MS = 6_000;

const OUTDOOR_SAMPLE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 60_000,
};

export type GpsEarlyStopListener = () => boolean;

/** Clock verification calls this after each sample; return true to stop GPS (Good/Fair). */
export function setGpsEarlyStopListener(listener: GpsEarlyStopListener | null): void {
  earlyStopListener = listener;
}

/** Stop further GPS samples once punch is allowed. */
export function pauseClockGpsSampling(): void {
  clockSamplingPaused = true;
  clearAllWatchers();
  prepareCycleInFlight = null;
  if (prepareStatus === "preparing") {
    prepareStatus = "ready";
    prepareError = null;
    notifyState();
  }
  gpsLog("clock GPS sampling paused");
}

export function resumeClockGpsSampling(): void {
  clockSamplingPaused = false;
  gpsLog("clock GPS sampling resumed");
}

export function isClockGpsSamplingPaused(): boolean {
  return clockSamplingPaused;
}

function gpsLog(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[gps] ${event}`, detail);
  } else {
    console.log(`[gps] ${event}`);
  }
}

function notifyState() {
  for (const fn of stateListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function bumpPrepareGeneration(): number {
  prepareGeneration += 1;
  gpsLog("generation bumped", { generation: prepareGeneration });
  return prepareGeneration;
}

function isActiveGeneration(gen: number): boolean {
  return gen === prepareGeneration;
}

export function subscribeGpsCache(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function getLocationPrepareSnapshot(): {
  status: LocationPrepareStatus;
  error: string | null;
  cached: CachedGpsPosition | null;
} {
  const cached = readCacheRaw();
  let status = prepareStatus;
  if (cached && isCacheFresh(cached)) {
    status = prepareStatus === "error" ? "error" : "ready";
  } else if (prepareStatus === "ready") {
    status = "stale";
  }
  return { status, error: prepareError, cached: isCacheFresh(cached) ? cached : null };
}

function geolocationError(err: GeolocationPositionError): Error {
  if (err.code === err.PERMISSION_DENIED) {
    gpsLog("permission denied");
    return new Error("Location permission denied. Please allow location access to clock in/out.");
  }
  if (err.code === err.TIMEOUT) {
    gpsLog("browser timeout");
  }
  return new Error(GPS_UNAVAILABLE_MSG);
}

function parsePosition(pos: GeolocationPosition): StaffPosition {
  const accuracy = pos.coords.accuracy;
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: Number.isFinite(accuracy) ? accuracy : 9999,
  };
}

function clearAllWatchers(): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  for (const id of activeWatchIds) {
    try {
      navigator.geolocation.clearWatch(id);
    } catch {
      /* ignore */
    }
  }
  if (activeWatchIds.length > 0) {
    gpsLog("watcher cleanup", { count: activeWatchIds.length });
  }
  activeWatchIds = [];
}

/**
 * Hard-capped geolocation read — clears watch on first fix or timeout.
 * Retries once automatically after reset if first attempt fails.
 */
function readPosition(
  options: PositionOptions,
  label: string,
  gen: number,
  allowRetry = true,
): Promise<StaffPosition> {
  punchMark(`GPS start: ${label}`);
  const t0 = punchTimeStart();

  const attempt = (): Promise<StaffPosition> =>
    new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("This browser cannot get your location. Use a phone with GPS enabled."));
        return;
      }

      let settled = false;
      let watchId: number | null = null;
      const browserTimeout = options.timeout ?? 8000;
      const hardTimeoutMs = browserTimeout + 2000;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimer);
        if (watchId != null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {
            /* ignore */
          }
          activeWatchIds = activeWatchIds.filter((id) => id !== watchId);
          gpsLog("watcher cleanup", { label, watchId });
          watchId = null;
        }
        fn();
      };

      gpsLog("geolocation start", {
        label,
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: browserTimeout,
        maximumAge: options.maximumAge,
        generation: gen,
      });
      startDevTimer("gps_get");

      const hardTimer = window.setTimeout(() => {
        finish(() => {
          endDevTimer("gps_get");
          gpsLog("hard timeout (stuck geolocation)", { label, hardTimeoutMs });
          reject(new Error(GPS_UNAVAILABLE_MSG));
        });
      }, hardTimeoutMs);

      const onSuccess = (pos: GeolocationPosition) => {
        if (!isActiveGeneration(gen)) {
          finish(() => reject(new Error("stale generation")));
          return;
        }
        const position = parsePosition(pos);
        punchTime(`GPS end: ${label}`, t0, `±${Math.round(position.accuracyMeters)}m`);
        gpsLog("accuracy received", {
          label,
          accuracyM: Math.round(position.accuracyMeters),
          lat: position.latitude,
          lng: position.longitude,
        });
        finish(() => {
          endDevTimer("gps_get");
          resolve(position);
        });
      };

      const onError = (err: GeolocationPositionError) => {
        punchTime(`GPS failed: ${label}`, t0, err.message);
        gpsLog("geolocation error", { label, code: err.code, message: err.message });
        finish(() => {
          endDevTimer("gps_get");
          reject(geolocationError(err));
        });
      };

      try {
        watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
        activeWatchIds.push(watchId);
      } catch {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
      }
    });

  return attempt().catch(async (err) => {
    if (!allowRetry || !isActiveGeneration(gen)) throw err;
    gpsLog("retry triggered", { label, reason: err instanceof Error ? err.message : "unknown" });
    resetGeolocationRuntime("read-retry");
    await sleep(400);
    return readPosition(options, `${label}-retry`, gen, false);
  });
}

function resetGeolocationRuntime(reason: string): void {
  gpsLog("reset geolocation runtime", { reason });
  clearAllWatchers();
  prepareCycleInFlight = null;
}

function isCacheFresh(cached: CachedGpsPosition | null): cached is CachedGpsPosition {
  if (!cached) return false;
  return Date.now() - cached.cachedAt <= GPS_CACHE_TTL_MS;
}

export function isGpsCacheReusableForPunch(
  cached: CachedGpsPosition | null,
): cached is CachedGpsPosition {
  if (!cached) return false;
  return Date.now() - cached.cachedAt <= GPS_PUNCH_REUSE_TTL_MS;
}

function isCacheDisplayable(cached: CachedGpsPosition | null): cached is CachedGpsPosition {
  if (!cached) return false;
  return Date.now() - cached.cachedAt <= GPS_DISPLAY_STALE_MAX_MS;
}

function pushGpsSample(position: StaffPosition): void {
  sampleBuffer.push(position);
  if (sampleBuffer.length > GPS_SAMPLE_BUFFER_MAX) {
    sampleBuffer = sampleBuffer.slice(-GPS_SAMPLE_BUFFER_MAX);
  }
}

function clearGpsSampleBuffer(): void {
  sampleBuffer = [];
}

function aggregatedFromBuffer(): AggregatedGpsPosition | null {
  return aggregateGpsSamples(sampleBuffer);
}

function writeCache(position: StaffPosition, gen: number): CachedGpsPosition | null {
  if (!isActiveGeneration(gen)) return null;
  pushGpsSample(position);
  const aggregated = aggregatedFromBuffer();
  const entry: CachedGpsPosition = aggregated
    ? {
        latitude: aggregated.latitude,
        longitude: aggregated.longitude,
        accuracyMeters: aggregated.accuracyMeters,
        sampleCount: aggregated.sampleCount,
        sampleSpreadMeters: aggregated.sampleSpreadMeters,
        cachedAt: Date.now(),
      }
    : {
        ...position,
        sampleCount: 1,
        sampleSpreadMeters: 0,
        cachedAt: Date.now(),
      };
  memoryCache = entry;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    }
  } catch {
    /* ignore */
  }
  gpsLog("cache written", {
    accuracyM: Math.round(entry.accuracyMeters),
    samples: entry.sampleCount,
    spreadM: entry.sampleSpreadMeters,
  });
  notifyState();
  return entry;
}

function readCacheRaw(): CachedGpsPosition | null {
  if (memoryCache) {
    return memoryCache;
  }
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGpsPosition;
    if (
      !parsed ||
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      typeof parsed.cachedAt !== "number"
    ) {
      return null;
    }
    memoryCache = parsed;
    gpsLog("cached location used (storage)", {
      ageMs: Date.now() - parsed.cachedAt,
      accuracyM: Math.round(parsed.accuracyMeters ?? 0),
    });
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedGpsPosition(): CachedGpsPosition | null {
  const c = readCacheRaw();
  return isCacheFresh(c) ? c : null;
}

/** Punch may reuse a fix up to {@link GPS_PUNCH_REUSE_TTL_MS} without a new GPS read. */
export function getCachedGpsPositionForPunch(): CachedGpsPosition | null {
  const c = readCacheRaw();
  if (isGpsCacheReusableForPunch(c)) return c;
  return isCacheFresh(c) ? c : null;
}

function positionOptionsWithPunchCache(base: PositionOptions): PositionOptions {
  const cached = readCacheRaw();
  if (isGpsCacheReusableForPunch(cached)) {
    return { ...base, maximumAge: GPS_PUNCH_REUSE_TTL_MS };
  }
  return base;
}

/** Stale-but-recent fix for UI while preparing (page reopen / resume). */
export function getCachedGpsPositionForDisplay(): CachedGpsPosition | null {
  const fresh = getCachedGpsPosition();
  if (fresh) return fresh;
  const raw = readCacheRaw();
  if (raw && isCacheDisplayable(raw)) {
    gpsLog("cached location used (display stale)", { ageMs: Date.now() - raw.cachedAt });
    return raw;
  }
  return null;
}

export function getGpsCacheAgeMs(): number | null {
  const c = readCacheRaw();
  if (!c) return null;
  return Date.now() - c.cachedAt;
}

export function getGpsSampleMeta(): { sampleCount: number; sampleSpreadMeters: number } {
  const cached = getCachedGpsPositionForDisplay();
  if (cached?.sampleCount != null) {
    return {
      sampleCount: cached.sampleCount,
      sampleSpreadMeters: cached.sampleSpreadMeters ?? 0,
    };
  }
  const aggregated = aggregatedFromBuffer();
  return {
    sampleCount: aggregated?.sampleCount ?? sampleBuffer.length,
    sampleSpreadMeters: aggregated?.sampleSpreadMeters ?? 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** getCurrentPosition only — faster than watchPosition for clock (≤10s budget). */
function readPositionFast(
  options: PositionOptions,
  label: string,
  gen: number,
): Promise<StaffPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser cannot get your location. Use a phone with GPS enabled."));
      return;
    }

    let settled = false;
    const browserTimeout = options.timeout ?? 3500;
    const hardTimeoutMs = browserTimeout + 800;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hardTimer);
      fn();
    };

    gpsLog("geolocation fast read", { label, timeout: browserTimeout, generation: gen });
    startDevTimer("gps_get");

    const hardTimer = window.setTimeout(() => {
      finish(() => {
        endDevTimer("gps_get");
        reject(new Error(GPS_UNAVAILABLE_MSG));
      });
    }, hardTimeoutMs);

    const onSuccess = (pos: GeolocationPosition) => {
      if (!isActiveGeneration(gen)) {
        finish(() => reject(new Error("stale generation")));
        return;
      }
      finish(() => {
        endDevTimer("gps_get");
        resolve(parsePosition(pos));
      });
    };

    const onError = (err: GeolocationPositionError) => {
      finish(() => {
        endDevTimer("gps_get");
        reject(geolocationError(err));
      });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
  });
}

function tryEarlyStopAfterSample(): boolean {
  if (!earlyStopListener) return false;
  try {
    return earlyStopListener();
  } catch {
    return false;
  }
}

type PrepareCycleOptions = { fullSample?: boolean };

/** Normal shop: one quick fix, no multi-sample or early-stop loop. */
async function runOutdoorPrepareCycle(gen: number): Promise<void> {
  if (clockSamplingPaused) {
    gpsLog("outdoor prepare skipped — sampling paused");
    return;
  }

  prepareCycleStartedAt = Date.now();
  clearGpsSampleBuffer();

  try {
    const pos = await readPositionFast(
      positionOptionsWithPunchCache(OUTDOOR_SAMPLE_OPTIONS),
      "outdoor-single",
      gen,
    );
    writeCache(pos, gen);
    prepareStatus = "ready";
    prepareError = null;
    notifyState();
    gpsLog("outdoor prepare done (single sample)");
  } catch (e) {
    const cached = readCacheRaw();
    if (cached && isCacheDisplayable(cached)) {
      memoryCache = cached;
      prepareStatus = "ready";
      prepareError = null;
      notifyState();
      gpsLog("outdoor prepare using cached fix after error");
      return;
    }
    throw e;
  }
}

/** Clock indoor: ≤3 samples, ≤10s, stop early when listener says Good/Fair. */
async function runIndoorPrepareCycle(gen: number, _opts?: PrepareCycleOptions): Promise<void> {
  if (clockSamplingPaused) {
    gpsLog("prepare skipped — sampling paused");
    return;
  }

  prepareCycleStartedAt = Date.now();
  const deadlineAt = prepareCycleStartedAt + GPS_MAX_CHECK_MS;
  const overBudget = () => Date.now() >= deadlineAt;
  let lastError: unknown = null;

  clearGpsSampleBuffer();

  const sampleOptions = [CLOCK_SAMPLE_OPTIONS, CLOCK_SAMPLE2_OPTIONS, CLOCK_SAMPLE_OPTIONS];

  for (let i = 0; i < GPS_CLOCK_MAX_SAMPLES; i++) {
    if (!isActiveGeneration(gen) || overBudget() || clockSamplingPaused) break;

    const baseOpts = sampleOptions[i] ?? CLOCK_SAMPLE_OPTIONS;
    const opts = i === 0 ? positionOptionsWithPunchCache(baseOpts) : baseOpts;
    const label = `clock-sample-${i + 1}`;

    try {
      const pos = await readPositionFast(opts, label, gen);
      writeCache(pos, gen);
      prepareStatus = "ready";
      prepareError = null;
      notifyState();

      if (tryEarlyStopAfterSample()) {
        gpsLog("early stop — Good/Fair reached", { sample: i + 1 });
        pauseClockGpsSampling();
        return;
      }
    } catch (e) {
      lastError = e;
      gpsLog("clock sample failed", {
        index: i + 1,
        error: e instanceof Error ? e.message : "unknown",
      });
      if (sampleBuffer.length === 0 && i === GPS_CLOCK_MAX_SAMPLES - 1 && !overBudget()) {
        /* one quick retry with cached age allowed */
        try {
          const retry = await readPositionFast(
            { ...CLOCK_SAMPLE_OPTIONS, maximumAge: 60_000 },
            `${label}-cached`,
            gen,
          );
          writeCache(retry, gen);
          prepareStatus = "ready";
          notifyState();
          if (tryEarlyStopAfterSample()) {
            pauseClockGpsSampling();
            return;
          }
        } catch {
          /* fall through */
        }
      }
    }

    if (i < GPS_CLOCK_MAX_SAMPLES - 1 && !overBudget() && !clockSamplingPaused) {
      await sleep(200);
    }
  }

  if (!isActiveGeneration(gen)) return;

  if (sampleBuffer.length === 0) {
    if (lastError instanceof Error) throw lastError;
    throw new Error(GPS_UNAVAILABLE_MSG);
  }

  prepareStatus = "ready";
  prepareError = null;
  notifyState();
}

async function runPrepareCycle(gen: number, opts?: PrepareCycleOptions): Promise<void> {
  if (clockIndoorConfidenceMode) {
    return runIndoorPrepareCycle(gen, opts);
  }
  return runOutdoorPrepareCycle(gen);
}

async function runPrepareCycleSafe(force = false): Promise<void> {
  if (clockSamplingPaused && !force) return Promise.resolve();
  if (prepareCycleInFlight && !force) return prepareCycleInFlight;

  const gen = prepareGeneration;
  const wasStale = prepareStatus === "stale";
  if (!wasStale && prepareStatus !== "error") {
    prepareStatus = "preparing";
    prepareError = null;
    notifyState();
  }

  prepareCycleInFlight = (async () => {
    try {
      await runPrepareCycle(gen, { fullSample: false });
      if (!isActiveGeneration(gen)) return;
      prepareStatus = "ready";
      prepareError = null;
      notifyState();
    } catch (e) {
      if (!isActiveGeneration(gen)) return;
      const err = e instanceof Error ? e : new Error(GPS_UNAVAILABLE_MSG);
      prepareError = err.message.includes("permission") ? err.message : GPS_UNAVAILABLE_MSG;
      prepareStatus = "error";
      gpsLog("prepare cycle error", { message: prepareError });
      notifyState();
    } finally {
      prepareCycleInFlight = null;
    }
  })();

  return prepareCycleInFlight;
}

function checkPrepareStuck() {
  if (prepareStatus !== "preparing" || !prepareCycleStartedAt) return;
  const elapsed = Date.now() - prepareCycleStartedAt;
  const stuckMs = clockIndoorConfidenceMode ? GPS_PREPARE_STUCK_MS : GPS_OUTDOOR_MAX_CHECK_MS;
  if (elapsed < stuckMs) return;

  gpsLog("prepare stuck watchdog — auto recovery", { elapsedMs: elapsed });
  void recoverFromStuckPrepare();
}

async function recoverFromStuckPrepare(): Promise<void> {
  gpsLog("prepare deadline — use best available fix");
  clearAllWatchers();
  prepareCycleInFlight = null;
  if (sampleBuffer.length > 0 || memoryCache) {
    prepareStatus = "ready";
    prepareError = null;
  } else {
    prepareStatus = "error";
    prepareError = GPS_CHECKING_TIMEOUT_MSG;
  }
  notifyState();
}

function updateStaleStatus() {
  const cached = readCacheRaw();
  if (!cached) return;
  if (!isCacheFresh(cached) && prepareStatus === "ready" && !prepareCycleInFlight) {
    prepareStatus = "stale";
    notifyState();
    void runPrepareCycleSafe();
  }
}

function onPageVisible() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  gpsLog("page visible — resume GPS");
  void resumeLocationAfterBackground();
}

function onPageShow(ev: PageTransitionEvent) {
  if (ev.persisted) {
    gpsLog("bfcache pageshow — hard restart GPS");
  }
  void resumeLocationAfterBackground();
}

async function resumeLocationAfterBackground(): Promise<void> {
  const gen = bumpPrepareGeneration();
  resetGeolocationRuntime("resume");
  const cached = readCacheRaw();
  if (cached) {
    const ageMs = Date.now() - cached.cachedAt;
    if (isCacheFresh(cached)) {
      memoryCache = cached;
      prepareStatus = "ready";
      notifyState();
    } else if (ageMs > GPS_DISPLAY_STALE_MAX_MS) {
      gpsLog("clearing invalid stale cache on resume", { ageMs });
      clearCacheStorage();
    }
  } else {
    prepareStatus = "preparing";
    prepareError = null;
    notifyState();
  }
  if (!isActiveGeneration(gen)) return;
  clockSamplingPaused = false;
  await runPrepareCycleSafe(true);
}

function installLifecycleHandlers(): void {
  if (lifecycleInstalled || typeof window === "undefined") return;
  lifecycleInstalled = true;
  document.addEventListener("visibilitychange", onPageVisible);
  window.addEventListener("pageshow", onPageShow);
  gpsLog("lifecycle handlers installed");
}

function uninstallLifecycleHandlers(): void {
  if (!lifecycleInstalled || typeof window === "undefined") return;
  document.removeEventListener("visibilitychange", onPageVisible);
  window.removeEventListener("pageshow", onPageShow);
  lifecycleInstalled = false;
}

/**
 * Full restart of GPS acquisition (page reopen, refresh, recovery).
 */
export function hardRestartLocationService(): void {
  bumpPrepareGeneration();
  clockSamplingPaused = false;
  resetGeolocationRuntime("hard-restart");
  clearCacheStorage();
  prepareStatus = "preparing";
  prepareError = null;
  notifyState();
  void runPrepareCycleSafe(true);
}

/**
 * Call once when clock page mounts. Requests GPS immediately + periodic refresh.
 */
export function startPreparedLocationService(options?: {
  indoorConfidenceMode?: boolean;
}): () => void {
  setClockGpsIndoorConfidenceMode(options?.indoorConfidenceMode === true);

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    prepareStatus = "error";
    prepareError = "This browser cannot get your location.";
    notifyState();
    return () => {};
  }

  installLifecycleHandlers();

  const existing = readCacheRaw();
  if (existing && isCacheFresh(existing)) {
    prepareStatus = "ready";
    memoryCache = existing;
    gpsLog("cached location used (fresh on start)", {
      ageMs: Date.now() - existing.cachedAt,
    });
    notifyState();
    if (clockIndoorConfidenceMode && !tryEarlyStopAfterSample()) {
      void runPrepareCycleSafe();
    } else if (!clockIndoorConfidenceMode) {
      void runPrepareCycleSafe();
    }
  } else {
    if (existing && !isCacheDisplayable(existing)) {
      clearCacheStorage();
    }
    prepareStatus = "preparing";
    prepareError = null;
    notifyState();
    void runPrepareCycleSafe(true);
  }

  if (refreshTimer != null) window.clearInterval(refreshTimer);
  if (clockIndoorConfidenceMode) {
    refreshTimer = window.setInterval(() => {
      if (!clockSamplingPaused) void runPrepareCycleSafe();
    }, GPS_REFRESH_INTERVAL_MS);
  } else {
    refreshTimer = null;
  }

  if (staleCheckTimer != null) window.clearInterval(staleCheckTimer);
  staleCheckTimer = window.setInterval(updateStaleStatus, 1000);

  if (stuckWatchdogTimer != null) window.clearInterval(stuckWatchdogTimer);
  stuckWatchdogTimer = window.setInterval(checkPrepareStuck, 2000);

  return () => {
    if (refreshTimer != null) window.clearInterval(refreshTimer);
    if (staleCheckTimer != null) window.clearInterval(staleCheckTimer);
    if (stuckWatchdogTimer != null) window.clearInterval(stuckWatchdogTimer);
    refreshTimer = null;
    staleCheckTimer = null;
    stuckWatchdogTimer = null;
    setGpsEarlyStopListener(null);
    clockSamplingPaused = false;
    clockIndoorConfidenceMode = false;
    clearAllWatchers();
    resetGeolocationRuntime("service-stop");
    uninstallLifecycleHandlers();
  };
}

export function gpsAccuracyTier(accuracyMeters: number | null | undefined): GpsAccuracyTier {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return "unknown";
  if (accuracyMeters <= GPS_GOOD_ACCURACY_M) return "good";
  if (accuracyMeters <= GPS_FAIR_ACCURACY_M) return "fair";
  return "weak";
}

export function gpsAccuracyTierLabel(tier: GpsAccuracyTier): string {
  switch (tier) {
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "weak":
      return "Weak";
    default:
      return "—";
  }
}

export function isGpsAccuracyWeak(accuracyMeters: number): boolean {
  return accuracyMeters > GPS_WEAK_ACCURACY_METERS;
}

export function isLocationReadyForPunch(): boolean {
  const { status } = getLocationPrepareSnapshot();
  return status === "ready";
}

export function getPreparedGpsForPunch(): CachedGpsPosition {
  const cached = getCachedGpsPositionForPunch();
  if (!cached) {
    throw new Error("Location is not ready. Please wait until preparation finishes.");
  }
  punchMark("punch uses prepared GPS (no new request)");
  return cached;
}

const ADMIN_MAP_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

function adminGeolocationError(err: GeolocationPositionError): Error {
  if (err.code === err.PERMISSION_DENIED) {
    return new Error(
      "Location permission denied. Allow location access in your browser, or enter coordinates manually.",
    );
  }
  if (err.code === err.TIMEOUT) {
    return new Error(
      "Location timed out. Try again near a window, or enter latitude and longitude manually.",
    );
  }
  return new Error("Could not get your current location. Enter coordinates manually.");
}

/**
 * One-shot GPS read for admin shop forms — does not touch clock punch cache or listeners.
 */
export async function getAdminMapPosition(): Promise<
  Pick<StaffPosition, "latitude" | "longitude">
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("This browser cannot get your location. Enter coordinates manually.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hardTimer);
      fn();
    };

    const hardTimer = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            "Location timed out. Try again near a window, or enter latitude and longitude manually.",
          ),
        ),
      );
    }, 12_000);

    const onSuccess = (pos: GeolocationPosition) => {
      finish(() => {
        const p = parsePosition(pos);
        resolve({ latitude: p.latitude, longitude: p.longitude });
      });
    };

    const onError = (err: GeolocationPositionError) => {
      finish(() => reject(adminGeolocationError(err)));
    };

    try {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, ADMIN_MAP_GEO_OPTIONS);
    } catch (e) {
      finish(() =>
        reject(e instanceof Error ? e : new Error("Could not get your current location.")),
      );
    }
  });
}

/** @deprecated Use getAdminMapPosition for admin forms (avoids clock GPS side effects). */
export async function getStaffPosition(): Promise<Pick<StaffPosition, "latitude" | "longitude">> {
  return getAdminMapPosition();
}

function clearCacheStorage(): void {
  memoryCache = null;
  clearGpsSampleBuffer();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("punch-card-gps-cache-v2");
    }
  } catch {
    /* ignore */
  }
  gpsLog("cache cleared");
}

export function clearGpsCache(): void {
  clearCacheStorage();
  prepareStatus = "preparing";
  prepareError = null;
  notifyState();
}

/**
 * Manual refresh — full GPS process restart (watchers, cache, samples, generation).
 */
export async function forceRefreshGpsPosition(): Promise<void> {
  const gen = bumpPrepareGeneration();
  gpsLog("force refresh start", { generation: gen });

  clockSamplingPaused = false;
  resetGeolocationRuntime("force-refresh");
  clearCacheStorage();
  prepareCycleInFlight = null;
  prepareStatus = "preparing";
  prepareError = null;
  notifyState();

  try {
    await runPrepareCycle(gen, { fullSample: false });
    if (!isActiveGeneration(gen)) {
      gpsLog("force refresh ignored (stale generation)", { generation: gen });
      return;
    }
    prepareStatus = "ready";
    prepareError = null;
    notifyState();
    const cached = getCachedGpsPosition();
    const meta = getGpsSampleMeta();
    gpsLog("force refresh ready", {
      generation: gen,
      accuracy: cached?.accuracyMeters,
      samples: meta.sampleCount,
      spread: meta.sampleSpreadMeters,
    });
  } catch (e) {
    if (!isActiveGeneration(gen)) return;
    const err = e instanceof Error ? e : new Error(GPS_UNAVAILABLE_MSG);
    prepareError = err.message.includes("permission") ? err.message : GPS_UNAVAILABLE_MSG;
    prepareStatus = "error";
    notifyState();
    gpsLog("force refresh failed", { generation: gen, error: prepareError });
    throw err;
  }
}

/** @deprecated use startPreparedLocationService */
export function prefetchStaffPosition(): void {
  startPreparedLocationService();
}
