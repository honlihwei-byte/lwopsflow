import { getScheduleStatusCode } from "@/lib/shifts/schedule-off-day";
import { findOverlappingShift, shiftsOverlap } from "@/lib/shifts/schedule-overlap";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type CellVisualState = "empty" | "off" | "here" | "elsewhere" | "conflict";

export type OtherShopAssignment = {
  shop_id: string;
  shop_name: string;
  start_time: string;
  end_time: string;
};

type LocalShift = {
  status: string;
  is_off_day: boolean;
  start_time: string | null;
  end_time: string | null;
  template_id?: string | null;
};

/** Short label for grid cells, e.g. "Pierre Cardin" → "PC". */
export function shopAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function getActiveLocalShifts(shifts: LocalShift[]): LocalShift[] {
  return shifts.filter((s) => s.status === "active");
}

export function getTimedOtherShopAssignments(
  rows: Array<
    Pick<StaffScheduleRow, "staff_id" | "shift_date" | "shop_id" | "is_off_day" | "start_time" | "end_time"> & {
      shop_name: string;
    }
  >,
  staffId: string,
  date: string,
): OtherShopAssignment[] {
  return rows
    .filter(
      (r) =>
        r.staff_id === staffId &&
        r.shift_date === date &&
        !r.is_off_day &&
        r.start_time &&
        r.end_time,
    )
    .map((r) => ({
      shop_id: r.shop_id,
      shop_name: r.shop_name,
      start_time: r.start_time!,
      end_time: r.end_time!,
    }));
}

function localTimedShifts(active: LocalShift[]): LocalShift[] {
  return active.filter((s) => !s.is_off_day && s.start_time && s.end_time);
}

export function hasCrossShopTimeConflict(
  localTimed: LocalShift[],
  otherTimed: OtherShopAssignment[],
): boolean {
  for (const local of localTimed) {
    for (const other of otherTimed) {
      if (
        shiftsOverlap(
          local.start_time!,
          local.end_time!,
          other.start_time,
          other.end_time,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function computeCellVisualState(
  localShifts: LocalShift[],
  otherTimed: OtherShopAssignment[],
): CellVisualState {
  const active = getActiveLocalShifts(localShifts);
  const localOff = active.some((s) => s.is_off_day);
  const timedLocal = localTimedShifts(active);

  if (hasCrossShopTimeConflict(timedLocal, otherTimed)) return "conflict";
  if (timedLocal.length > 0) return "here";
  if (localOff) return "off";
  if (otherTimed.length > 0) return "elsewhere";
  return "empty";
}

export function wouldOverlapOtherShop(
  otherTimed: OtherShopAssignment[],
  start: string,
  end: string,
): OtherShopAssignment | null {
  for (const other of otherTimed) {
    if (shiftsOverlap(start, end, other.start_time, other.end_time)) return other;
  }
  return null;
}

export function wouldOverlapOtherShopFromRows(
  otherRows: StaffScheduleRow[],
  staffId: string,
  date: string,
  start: string,
  end: string,
): StaffScheduleRow | null {
  const timed = otherRows.filter(
    (r) =>
      r.staff_id === staffId &&
      r.shift_date === date &&
      r.status === "active" &&
      !r.is_off_day &&
      r.start_time &&
      r.end_time,
  );
  return findOverlappingShift(
    timed as StaffScheduleRow[],
    start,
    end,
  );
}

export type CellViewLabels = {
  notScheduledHere: string;
  offDayLabel: string;
  workingAtOther: string;
  otherShopTimes: string;
  assignedAtTooltip: string;
  currentShopLine: string;
};

export type CellView = {
  state: CellVisualState;
  primary: string;
  secondary?: string;
  more: number;
  tooltip: string;
  otherTimed: OtherShopAssignment[];
};

export function buildCellView(
  localShifts: LocalShift[],
  crossShopRows: Array<
    Pick<StaffScheduleRow, "staff_id" | "shift_date" | "shop_id" | "is_off_day" | "start_time" | "end_time"> & {
      shop_name: string;
    }
  >,
  staffId: string,
  date: string,
  templates: Array<{ id: string; name: string }>,
  currentShopName: string,
  labels: CellViewLabels,
  formatWorkingAtOther: (shop: string) => string,
  formatOtherTimes: (start: string, end: string) => string,
): CellView {
  const otherTimed = getTimedOtherShopAssignments(crossShopRows, staffId, date);
  const state = computeCellVisualState(localShifts, otherTimed);
  const active = getActiveLocalShifts(localShifts);
  const timedLocal = localTimedShifts(active);
  const localOff = active.some((s) => s.is_off_day);

  let primary = labels.notScheduledHere;
  let secondary: string | undefined;
  let more = 0;

  if (state === "off") {
    const offRow = active.find((s) => s.is_off_day);
    primary = offRow ? (getScheduleStatusCode(offRow) ?? labels.offDayLabel) : labels.offDayLabel;
  } else if (state === "here" || state === "conflict") {
    const first = timedLocal[0];
    if (first?.start_time && first.end_time) {
      const matched = first.template_id
        ? templates.find((item) => item.id === first.template_id)
        : undefined;
      primary = matched?.name ?? `${first.start_time}–${first.end_time}`;
      secondary = matched?.name ? `(${first.start_time}–${first.end_time})` : undefined;
      more = Math.max(0, timedLocal.length - 1);
    } else if (localOff) {
      primary = labels.offDayLabel;
    }
  } else if (state === "elsewhere" && otherTimed[0]) {
    const o = otherTimed[0]!;
    primary = formatWorkingAtOther(shopAbbrev(o.shop_name));
    secondary = formatOtherTimes(o.start_time, o.end_time);
    more = Math.max(0, otherTimed.length - 1);
  }

  const tooltipParts: string[] = [];
  if (timedLocal.length > 0 || localOff) {
    tooltipParts.push(labels.currentShopLine);
    tooltipParts.push(currentShopName);
    if (localOff && timedLocal.length === 0) {
      tooltipParts.push(labels.offDayLabel);
    } else {
      for (const s of timedLocal) {
        if (s.start_time && s.end_time) tooltipParts.push(`${s.start_time}–${s.end_time}`);
      }
    }
  }
  for (const o of otherTimed) {
    tooltipParts.push(labels.assignedAtTooltip);
    tooltipParts.push(o.shop_name);
    tooltipParts.push(`${o.start_time}–${o.end_time}`);
  }

  return {
    state,
    primary,
    secondary,
    more,
    tooltip: tooltipParts.join("\n"),
    otherTimed,
  };
}

export const CELL_STATE_CLASSES: Record<CellVisualState, string> = {
  empty:
    "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
  off: "bg-sky-100 text-sky-950 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:border-sky-800",
  here: "bg-sky-100 text-sky-950 border border-sky-300 dark:bg-sky-950/50 dark:text-sky-100 dark:border-sky-700",
  elsewhere:
    "bg-orange-100 text-orange-950 border border-orange-300 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-800",
  conflict:
    "bg-red-100 text-red-950 border border-red-400 dark:bg-red-950/40 dark:text-red-100 dark:border-red-700",
};
