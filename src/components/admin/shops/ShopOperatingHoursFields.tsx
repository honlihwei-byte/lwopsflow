"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  DEFAULT_SHOP_SCHEDULING,
  type ShopSchedulingFields,
  type WorkTimeMode,
} from "@/lib/shop-scheduling";

type Props = {
  value: ShopSchedulingFields;
  onChange: (v: ShopSchedulingFields) => void;
  disabled?: boolean;
};

const WORK_TIME_MODES: WorkTimeMode[] = ["fixed", "shift_based"];

export function ShopOperatingHoursFields({ value, onChange, disabled }: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        {t("shops.editForm.hours.sectionTitle")}
      </p>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("shops.editForm.hours.workTimeModeLabel")}
        <select
          className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          value={value.work_time_mode}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, work_time_mode: e.target.value as WorkTimeMode })
          }
        >
          {WORK_TIME_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`shops.detail.workTimeMode.${mode}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.hours.openingTime")}
          <input
            type="time"
            disabled={disabled}
            value={value.opening_time}
            onChange={(e) => onChange({ ...value, opening_time: e.target.value.slice(0, 5) })}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.hours.closingTime")}
          <input
            type="time"
            disabled={disabled}
            value={value.closing_time}
            onChange={(e) => onChange({ ...value, closing_time: e.target.value.slice(0, 5) })}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.hours.breakMinutes")}
          <input
            type="number"
            min={0}
            max={600}
            disabled={disabled}
            value={value.break_minutes}
            onChange={(e) => onChange({ ...value, break_minutes: Number(e.target.value) || 0 })}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
      </div>

      {value.work_time_mode === "fixed" ? (
        <p className="text-xs text-zinc-500">
          {t("shops.editForm.hours.fixedAttendancePrefix")} {value.opening_time}–{value.closing_time} (
          {value.break_minutes}
          {t("shops.editForm.hours.minuteBreakSuffix")}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">{t("shops.editForm.hours.shiftAttendanceHint")}</p>
      )}
    </div>
  );
}

export function schedulingFromShop(shop: {
  work_time_mode?: string;
  opening_time?: string | null;
  closing_time?: string | null;
  break_minutes?: number | null;
}): ShopSchedulingFields {
  return {
    work_time_mode: shop.work_time_mode === "shift_based" ? "shift_based" : "fixed",
    opening_time: shop.opening_time?.slice(0, 5) ?? DEFAULT_SHOP_SCHEDULING.opening_time,
    closing_time: shop.closing_time?.slice(0, 5) ?? DEFAULT_SHOP_SCHEDULING.closing_time,
    break_minutes: shop.break_minutes ?? DEFAULT_SHOP_SCHEDULING.break_minutes,
  };
}
