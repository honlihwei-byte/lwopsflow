const PUNCH_TIMING_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_PUNCH_TIMING === "1";

export function isPunchTimingEnabled(): boolean {
  return PUNCH_TIMING_ENABLED;
}

export function punchMark(label: string): void {
  if (!PUNCH_TIMING_ENABLED) return;
  console.log(`[punch-timing] ▶ ${label}`);
}

export function punchTime(label: string, startMs: number, extra?: string): number {
  const elapsed =
    typeof performance !== "undefined" ? performance.now() - startMs : 0;
  if (PUNCH_TIMING_ENABLED) {
    const suffix = extra ? ` (${extra})` : "";
    console.log(`[punch-timing] ${label}: ${elapsed.toFixed(0)}ms${suffix}`);
  }
  return elapsed;
}

export function punchTimeStart(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

const activeSectionTimers = new Set<string>();

/** Dev-only `console.time` sections — e.g. gps, attendance_insert, total_punch */
export function punchTimeSectionStart(label: string): void {
  if (!PUNCH_TIMING_ENABLED) return;
  if (activeSectionTimers.has(label)) {
    console.timeEnd(label);
    activeSectionTimers.delete(label);
  }
  console.time(label);
  activeSectionTimers.add(label);
}

export function punchTimeSectionEnd(label: string): void {
  if (!PUNCH_TIMING_ENABLED) return;
  if (!activeSectionTimers.has(label)) return;
  console.timeEnd(label);
  activeSectionTimers.delete(label);
}
