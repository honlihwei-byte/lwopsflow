"use client";

import { useRef } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { buildCellView, type CellVisualState } from "@/lib/shifts/schedule-cell-status";
import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";
import type { ScheduleRow } from "../EditShiftsModal";
import type { CrossShopScheduleRow } from "./schedule-utils";
import {
  cellAssignmentValue,
  detectCellConflicts,
  type CellConflict,
} from "./schedule-utils";
import { cellColorClasses, resolveShiftColorKey } from "./schedule-colors";

const CONFLICT_ICONS: Record<CellConflict, string> = {
  double_shift: "⚠",
  two_stores: "🏪",
  leave_shift: "⊘",
  insufficient_rest: "💤",
};

export function ScheduleCell({
  staffId,
  date,
  shifts,
  crossShopRows,
  templates,
  currentShopName,
  cellViewLabels,
  formatWorkingAtOther,
  formatOtherTimes,
  isToday,
  isWeekend,
  isSelected,
  isFocused,
  isSaving,
  isDragTarget,
  onClick,
  onContextMenu,
  onMouseDown,
  onMouseEnter,
}: {
  staffId: string;
  date: string;
  shifts: ScheduleRow[];
  crossShopRows: CrossShopScheduleRow[];
  templates: ShopShiftTemplate[];
  currentShopName: string;
  cellViewLabels: Parameters<typeof buildCellView>[6];
  formatWorkingAtOther: (shop: string) => string;
  formatOtherTimes: (start: string, end: string) => string;
  isToday: boolean;
  isWeekend: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isSaving: boolean;
  isDragTarget: boolean;
  onClick: (e: React.MouseEvent, el: HTMLButtonElement) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
}) {
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);

  const view = buildCellView(
    shifts,
    crossShopRows,
    staffId,
    date,
    templates,
    currentShopName,
    cellViewLabels,
    formatWorkingAtOther,
    formatOtherTimes,
  );

  const value = cellAssignmentValue(shifts, templates);
  const colorKey = resolveShiftColorKey(value, templates, view.state);
  const hasOtherShop = view.otherTimed.length > 0;
  const conflicts = detectCellConflicts(shifts, hasOtherShop, undefined);
  const visualState: CellVisualState =
    conflicts.length > 0 || view.state === "conflict" ? "conflict" : view.state;

  const primaryRow = view.primary;
  const timeRow = view.secondary?.replace(/[()]/g, "") ?? "";

  const firstShift = shifts.find((s) => s.status === "active") as
    | (ScheduleRow & { created_at?: string })
    | undefined;
  const hoverTitle = [
    view.tooltip,
    firstShift?.created_at
      ? `${t("shops.editForm.scheduler.created")}: ${new Date(firstShift.created_at).toLocaleString()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      ref={btnRef}
      type="button"
      title={hoverTitle}
      onClick={(e) => onClick(e, btnRef.current!)}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={[
        "group relative h-[38px] w-full min-w-[72px] rounded-lg border px-1 py-0.5 text-center transition-all duration-100",
        cellColorClasses(visualState === "conflict" ? "conflict" : colorKey),
        isToday ? "ring-2 ring-amber-400/70 ring-offset-0" : "",
        isWeekend ? "bg-opacity-80" : "",
        isSelected ? "ring-2 ring-blue-500 shadow-sm" : "",
        isFocused ? "z-[1] ring-2 ring-blue-400" : "",
        isDragTarget ? "scale-[0.98] opacity-90" : "",
        "hover:shadow-sm hover:brightness-[1.02]",
      ].join(" ")}
    >
      {conflicts.length > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] text-white">
          {CONFLICT_ICONS[conflicts[0]!]}
        </span>
      ) : null}

      <div className="flex h-full flex-col items-center justify-center leading-tight">
        <div className="w-full truncate text-[10px] font-semibold">{primaryRow}</div>
        {timeRow ? (
          <div className="w-full truncate text-[9px] opacity-75">{timeRow}</div>
        ) : view.state === "empty" ? (
          <div className="text-[9px] opacity-40">—</div>
        ) : null}
        {view.more > 0 ? (
          <div className="text-[8px] opacity-70">+{view.more}</div>
        ) : null}
      </div>

      {isSaving ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 dark:bg-zinc-900/60">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : null}
    </button>
  );
}
