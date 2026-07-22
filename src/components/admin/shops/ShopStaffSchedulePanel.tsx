"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { ScheduleWorkspace } from "./schedule/ScheduleWorkspace";

export type CrossShopScheduleRow = {
  id: string;
  staff_id: string;
  shift_date: string;
  shop_id: string;
  shop_name: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  template_id: string | null;
  is_off_day: boolean;
  status: string;
};

export function ShopStaffSchedulePanel({
  shopId,
  workTimeMode,
  shopHours,
  shopName,
  shops,
  onShopChange,
}: {
  shopId: string;
  workTimeMode: "fixed" | "shift_based";
  shopHours: { opening: string; closing: string; break_minutes: number };
  shopName?: string;
  shops?: { id: string; name: string }[];
  onShopChange?: (id: string) => void;
}) {
  const { t } = useI18n();

  if (workTimeMode === "fixed") {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="font-semibold text-emerald-900 dark:text-emerald-100">
          {t("shops.detail.scheduleFixed.title")}
        </p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          {t("shops.detail.scheduleFixed.staffHoursPrefix")} {shopHours.opening}–{shopHours.closing} (
          {shopHours.break_minutes}
          {t("shops.detail.scheduleFixed.minuteBreak")}). {t("shops.detail.scheduleFixed.noPerStaff")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <ScheduleWorkspace
        shopId={shopId}
        shopName={shopName ?? ""}
        shops={shops}
        onShopChange={onShopChange}
      />
    </div>
  );
}
