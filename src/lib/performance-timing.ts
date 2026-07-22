const PERFORMANCE_TIMING_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_PERFORMANCE_TIMING === "1";

const activeTimers = new Set<string>();

export function isPerformanceTimingEnabled(): boolean {
  return PERFORMANCE_TIMING_ENABLED;
}

export function startDevTimer(label: string): void {
  if (!PERFORMANCE_TIMING_ENABLED) return;
  if (activeTimers.has(label)) {
    console.timeEnd(label);
    activeTimers.delete(label);
  }
  console.time(label);
  activeTimers.add(label);
}

export function endDevTimer(label: string): void {
  if (!PERFORMANCE_TIMING_ENABLED) return;
  if (!activeTimers.has(label)) return;
  console.timeEnd(label);
  activeTimers.delete(label);
}
