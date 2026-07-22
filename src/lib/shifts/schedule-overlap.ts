import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Two shifts overlap if their time ranges intersect (same calendar day). */
export function shiftsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  let as = toMinutes(aStart);
  let ae = toMinutes(aEnd);
  let bs = toMinutes(bStart);
  let be = toMinutes(bEnd);
  if (ae <= as) ae += 24 * 60;
  if (be <= bs) be += 24 * 60;
  return as < be && bs < ae;
}

export function findOverlappingShift(
  existing: StaffScheduleRow[],
  start: string,
  end: string,
  excludeId?: string,
): StaffScheduleRow | null {
  for (const row of existing) {
    if (row.status !== "active" || row.is_off_day) continue;
    if (excludeId && row.id === excludeId) continue;
    if (!row.start_time || !row.end_time) continue;
    if (shiftsOverlap(start, end, row.start_time, row.end_time)) return row;
  }
  return null;
}
