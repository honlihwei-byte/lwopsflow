import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { allActiveScheduleRows } from "@/lib/shifts/staff-schedules-dedupe";
import { getScheduleType } from "@/lib/shifts/schedule-type";
import { getScheduleStatusCode, isScheduleStatusCode } from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";
import type { ScheduleRow } from "../EditShiftsModal";
import { OFF_VALUE } from "../ScheduleCellPicker";

export type ScheduleStaff = {
  id: string;
  staff_name: string;
  staff_code: string;
  staff_type?: string;
};

export type CellCoord = { staffId: string; date: string };

export function mondayOfWeek(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

export function dayShort(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-MY", { weekday: "short" });
}

export function isWeekend(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function cellKey(staffId: string, date: string): string {
  return `${staffId}:${date}`;
}

export function parseCellKey(key: string): CellCoord {
  const [staffId, date] = key.split(":");
  return { staffId: staffId!, date: date! };
}

export function cellAssignmentValue(shifts: ScheduleRow[], templates: ShopShiftTemplate[]): string {
  const active = allActiveScheduleRows(shifts as StaffScheduleRow[]);
  if (active.length === 0) return "";
  const nonShift = active.find((s) => getScheduleType(s) !== "SHIFT");
  if (nonShift) {
    const code = getScheduleStatusCode(nonShift);
    return code ?? OFF_VALUE;
  }
  const canonical = active[0]!;
  if (canonical.is_off_day) {
    const code = getScheduleStatusCode(canonical);
    return code ?? OFF_VALUE;
  }
  if (canonical.template_id && templates.some((tpl) => tpl.id === canonical.template_id)) {
    return canonical.template_id;
  }
  if (canonical.start_time && canonical.end_time) {
    const byTimes = templates.find(
      (tpl) => tpl.start_time === canonical.start_time && tpl.end_time === canonical.end_time,
    );
    if (byTimes) return byTimes.id;
  }
  return canonical.template_id ?? "";
}

export function cellHasTimedShifts(shifts: ScheduleRow[]): boolean {
  return (shifts as StaffScheduleRow[]).some(
    (s) => s.status === "active" && getScheduleType(s) === "SHIFT" && s.start_time && s.end_time,
  );
}

/** Build display rows for optimistic assignment before the server responds. */
export function valueToSyntheticShifts(
  staffId: string,
  date: string,
  value: string,
  templates: ShopShiftTemplate[],
): ScheduleRow[] {
  if (!value || value === "NS") return [];

  const base: ScheduleRow = {
    id: `optimistic:${staffId}:${date}`,
    staff_id: staffId,
    shift_date: date,
    start_time: null,
    end_time: null,
    break_minutes: 0,
    template_id: null,
    is_off_day: false,
    status: "active",
  };

  if (value === OFF_VALUE || value === "RD" || isScheduleStatusCode(value)) {
    return [{ ...base, is_off_day: true }];
  }

  const tpl = templates.find((t) => t.id === value);
  if (tpl) {
    return [
      {
        ...base,
        template_id: tpl.id,
        start_time: tpl.start_time,
        end_time: tpl.end_time,
        break_minutes: tpl.break_minutes,
      },
    ];
  }

  return [];
}

export function findTemplateByName(
  templates: ShopShiftTemplate[],
  pattern: string,
): ShopShiftTemplate | undefined {
  const p = pattern.toLowerCase();
  return templates.find((t) => t.name.toLowerCase().includes(p));
}

export type CellConflict = "double_shift" | "two_stores" | "leave_shift" | "insufficient_rest";

export function detectCellConflicts(
  shifts: ScheduleRow[],
  hasOtherShop: boolean,
  prevDayShifts: ScheduleRow[] | undefined,
): CellConflict[] {
  const conflicts: CellConflict[] = [];
  const active = allActiveScheduleRows(shifts as StaffScheduleRow[]);
  const timed = active.filter((s) => !s.is_off_day && s.start_time && s.end_time);
  const hasOff = active.some((s) => s.is_off_day);

  if (timed.length > 1) conflicts.push("double_shift");
  if (hasOtherShop && timed.length > 0) conflicts.push("two_stores");
  if (hasOff && timed.length > 0) conflicts.push("leave_shift");

  if (prevDayShifts && timed[0]?.start_time) {
    const prevActive = allActiveScheduleRows(prevDayShifts as StaffScheduleRow[]);
    const prevTimed = prevActive.filter((s) => !s.is_off_day && s.end_time);
    if (prevTimed.length > 0) {
      const prevEnd = prevTimed[prevTimed.length - 1]!.end_time!;
      const currStart = timed[0]!.start_time!;
      const prevMins = timeToMinutes(prevEnd);
      const currMins = timeToMinutes(currStart);
      const gap = currMins + (currMins < prevMins ? 24 * 60 : 0) - prevMins;
      if (gap < 11 * 60) conflicts.push("insufficient_rest");
    }
  }

  return conflicts;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h! * 60 + m!;
}

export function computeHours(shifts: ScheduleRow[]): number {
  const active = allActiveScheduleRows(shifts as StaffScheduleRow[]);
  let total = 0;
  for (const s of active) {
    if (s.is_off_day || !s.start_time || !s.end_time) continue;
    const start = timeToMinutes(s.start_time);
    let end = timeToMinutes(s.end_time);
    if (end <= start) end += 24 * 60;
    total += (end - start - (s.break_minutes ?? 0)) / 60;
  }
  return Math.round(total * 10) / 10;
}

export function countDaysByType(
  staffId: string,
  weekDays: string[],
  cellMap: Map<string, ScheduleRow[]>,
  templates: ShopShiftTemplate[],
): { working: number; off: number; leave: number } {
  let working = 0;
  let off = 0;
  let leave = 0;
  for (const d of weekDays) {
    const shifts = cellMap.get(cellKey(staffId, d)) ?? [];
    const val = cellAssignmentValue(shifts, templates);
    if (!val) continue;
    if (val === OFF_VALUE || val === "RD" || val === "NS") {
      off++;
    } else if (isScheduleStatusCode(val)) {
      leave++;
    } else {
      working++;
    }
  }
  return { working, off, leave };
}

export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const s = new Date(`${weekStart}T12:00:00`);
  const e = new Date(`${weekEnd}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-MY", opts)} – ${e.toLocaleDateString("en-MY", { ...opts, year: "numeric" })}`;
}

export function todayYmd(): string {
  return malaysiaDateYmd(new Date());
}

export async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
