import {
  getCachedGpsPosition,
  getCachedGpsPositionForDisplay,
  type CachedGpsPosition,
} from "@/lib/geolocation-client";

export type TaskGpsCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type TaskGpsValidationStage =
  | "preflight_cache"
  | "get_location_button"
  | "submit"
  | "server_verify";

export function logTaskGpsValidation(params: {
  task_id: string;
  validation_stage: TaskGpsValidationStage;
  gps_status?: string;
  location_permission?: string;
  coordinates?: { lat: number; lng: number; accuracy_m: number | null } | null;
  error?: string;
}): void {
  console.info("[task-gps]", params);
}

export function isGpsLocationMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("location is required") ||
    lower.includes("gps verification required") ||
    lower.includes("gps permission") ||
    lower.includes("gps_required")
  );
}

export async function readLocationPermissionState(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
}

function fromCache(pos: CachedGpsPosition): TaskGpsCoordinates {
  return {
    latitude: pos.latitude,
    longitude: pos.longitude,
    accuracyMeters: pos.accuracyMeters ?? null,
  };
}

/** Prefer fresh cache, then live browser read (re-checks permission dynamically). */
export async function acquireTaskSubmitGps(
  taskId: string,
  stage: TaskGpsValidationStage = "get_location_button",
): Promise<TaskGpsCoordinates> {
  const permission = await readLocationPermissionState();

  const fresh = getCachedGpsPosition();
  if (fresh) {
    const coords = fromCache(fresh);
    logTaskGpsValidation({
      task_id: taskId,
      validation_stage: stage,
      gps_status: "cached_fresh",
      location_permission: permission,
      coordinates: {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy_m: coords.accuracyMeters,
      },
    });
    return coords;
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    logTaskGpsValidation({
      task_id: taskId,
      validation_stage: stage,
      gps_status: "unavailable",
      location_permission: permission,
      coordinates: null,
      error: "Geolocation API unavailable",
    });
    throw new Error("GPS_UNAVAILABLE");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: TaskGpsCoordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        };
        logTaskGpsValidation({
          task_id: taskId,
          validation_stage: stage,
          gps_status: "live_read",
          location_permission: permission,
          coordinates: {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy_m: coords.accuracyMeters,
          },
        });
        resolve(coords);
      },
      (err) => {
        const permissionDenied = err.code === err.PERMISSION_DENIED;
        logTaskGpsValidation({
          task_id: taskId,
          validation_stage: stage,
          gps_status: permissionDenied ? "permission_denied" : "read_failed",
          location_permission: permission,
          coordinates: null,
          error: err.message,
        });
        reject(new Error(permissionDenied ? "GPS_PERMISSION_DENIED" : "GPS_UNAVAILABLE"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

/** Non-blocking prefill from cache when opening a GPS-required task. */
export function prefillTaskGpsFromCache(taskId: string): TaskGpsCoordinates | null {
  const cached = getCachedGpsPosition() ?? getCachedGpsPositionForDisplay();
  if (!cached) return null;
  const coords = fromCache(cached);
  logTaskGpsValidation({
    task_id: taskId,
    validation_stage: "preflight_cache",
    gps_status: "cached_display",
    location_permission: "unknown",
    coordinates: {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy_m: coords.accuracyMeters,
    },
  });
  return coords;
}
