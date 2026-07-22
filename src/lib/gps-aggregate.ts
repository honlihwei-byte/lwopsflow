import { haversineDistanceMeters } from "@/lib/geo";
import type { StaffPosition } from "@/lib/geolocation-client";

export type AggregatedGpsPosition = StaffPosition & {
  sampleCount: number;
  sampleSpreadMeters: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Max pairwise distance between samples (0 if single sample). */
export function gpsSampleSpreadMeters(samples: StaffPosition[]): number {
  if (samples.length < 2) return 0;
  let maxSpread = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const d = haversineDistanceMeters(
        samples[i]!.latitude,
        samples[i]!.longitude,
        samples[j]!.latitude,
        samples[j]!.longitude,
      );
      if (d > maxSpread) maxSpread = d;
    }
  }
  return maxSpread;
}

/** Drop samples far from the cluster median (indoor multipath outliers). */
export function filterOutlierGpsSamples(samples: StaffPosition[]): StaffPosition[] {
  if (samples.length < 3) return samples;

  // Use a simple median centroid — do NOT call aggregateGpsSamples here (it calls this fn → stack overflow).
  const roughLat = median(samples.map((s) => s.latitude));
  const roughLng = median(samples.map((s) => s.longitude));

  const withDistance = samples.map((s) => ({
    sample: s,
    distM: haversineDistanceMeters(s.latitude, s.longitude, roughLat, roughLng),
  }));

  const distances = withDistance.map((x) => x.distM).sort((a, b) => a - b);
  const q1 = distances[Math.floor(distances.length * 0.25)] ?? 0;
  const q3 = distances[Math.floor(distances.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const maxAllowed = q3 + Math.max(1.5 * iqr, 60);

  const kept = withDistance.filter((x) => x.distM <= maxAllowed).map((x) => x.sample);
  return kept.length > 0 ? kept : samples;
}

/**
 * Robust position: outlier-filtered median lat/lng, best (lowest) reported accuracy.
 */
export function aggregateGpsSamples(samples: StaffPosition[]): AggregatedGpsPosition | null {
  if (samples.length === 0) return null;

  const filtered = filterOutlierGpsSamples(samples);
  const latitudes = filtered.map((s) => s.latitude);
  const longitudes = filtered.map((s) => s.longitude);
  const accuracyMeters = Math.min(...filtered.map((s) => s.accuracyMeters));

  return {
    latitude: median(latitudes),
    longitude: median(longitudes),
    accuracyMeters,
    sampleCount: filtered.length,
    sampleSpreadMeters: gpsSampleSpreadMeters(filtered),
  };
}
