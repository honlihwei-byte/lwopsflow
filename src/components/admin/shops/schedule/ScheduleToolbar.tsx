"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { weekRangeLabel } from "./schedule-utils";

export type BulkTool = "assign" | "off" | "leave" | "copy_week" | "auto" | "clear" | "rotate";

export function ScheduleToolbar({
  weekStart,
  weekEnd,
  shopName,
  shops,
  onShopChange,
  search,
  onSearchChange,
  showActiveOnly,
  onShowActiveOnlyChange,
  showFullTimeOnly,
  onShowFullTimeOnlyChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  onPrevWeek,
  onToday,
  onNextWeek,
  onJumpDate,
  onBulkTool,
}: {
  weekStart: string;
  weekEnd: string;
  shopName: string;
  shops?: { id: string; name: string }[];
  onShopChange?: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  showActiveOnly: boolean;
  onShowActiveOnlyChange: (v: boolean) => void;
  showFullTimeOnly: boolean;
  onShowFullTimeOnlyChange: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus: "idle" | "saving" | "saved";
  onPrevWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
  onJumpDate: (date: string) => void;
  onBulkTool: (tool: BulkTool) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200/60 bg-white/80 p-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100/80 p-0.5 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onPrevWeek}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-white hover:shadow-sm dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t("shops.editForm.scheduler.prevWeek")}
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-white hover:shadow-sm dark:text-blue-400 dark:hover:bg-zinc-800"
          >
            {t("shops.editForm.scheduler.today")}
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-white hover:shadow-sm dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t("shops.editForm.scheduler.nextWeek")}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="hidden sm:inline">{t("shops.editForm.scheduler.jumpTo")}</span>
          <input
            type="date"
            onChange={(e) => {
              if (e.target.value) onJumpDate(e.target.value);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <span className="text-[11px] font-medium text-zinc-500">
          {weekRangeLabel(weekStart, weekEnd)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {t("shops.editForm.staffSchedule.savingCell")}
            </span>
          ) : saveStatus === "saved" ? (
            <span className="text-[10px] text-emerald-500">{t("shops.editForm.scheduler.saved")}</span>
          ) : null}
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title={t("shops.editForm.scheduler.undo")}
            className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            ↩
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title={t("shops.editForm.scheduler.redo")}
            className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            ↪
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {shops && shops.length > 1 && onShopChange ? (
          <select
            value={shops.find((s) => s.name === shopName)?.id ?? ""}
            onChange={(e) => onShopChange(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium dark:border-zinc-700 dark:bg-zinc-900"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {shopName}
          </span>
        )}

        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("shops.editForm.scheduler.searchEmployees")}
          className="min-w-[140px] flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-[200px]"
        />

        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => onShowActiveOnlyChange(e.target.checked)}
            className="rounded"
          />
          {t("shops.editForm.scheduler.activeOnly")}
        </label>

        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <input
            type="checkbox"
            checked={showFullTimeOnly}
            onChange={(e) => onShowFullTimeOnlyChange(e.target.checked)}
            className="rounded"
          />
          {t("shops.editForm.scheduler.fullTimeOnly")}
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["assign", t("shops.editForm.scheduler.assignShift")],
            ["off", t("shops.editForm.staffSchedule.markOff")],
            ["leave", t("shops.editForm.scheduler.markLeave")],
            ["copy_week", t("shops.editForm.staffSchedule.copyPrevWeek")],
            ["auto", t("shops.editForm.scheduler.autoSchedule")],
            ["clear", t("shops.editForm.scheduler.clearWeek")],
            ["rotate", t("shops.editForm.scheduler.rotateShift")],
          ] as const
        ).map(([tool, label]) => (
          <button
            key={tool}
            type="button"
            onClick={() => onBulkTool(tool)}
            className="rounded-lg border border-zinc-200/80 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-white hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
