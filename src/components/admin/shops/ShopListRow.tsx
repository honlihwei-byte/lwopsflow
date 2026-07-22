"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShopPhotoDisplay } from "@/components/admin/shops/ShopPhotoField";
import { dashboardCard } from "@/components/admin/report/dashboard-ui";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { displayShopSetupStatus } from "@/lib/i18n/display-values";

export type ShopRowData = {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_indoor_mode?: boolean;
  work_time_mode?: string;
  opening_time?: string | null;
  closing_time?: string | null;
  break_minutes?: number | null;
  created_at?: string;
};

export type ShopRowStats = {
  employeeCount: number;
  activeShiftsToday: number;
};

export function shopAddressLabel(shop: ShopRowData, locationNotSet: string): string {
  if (shop.latitude != null && shop.longitude != null) {
    return `${Number(shop.latitude).toFixed(4)}, ${Number(shop.longitude).toFixed(4)}`;
  }
  return locationNotSet;
}

export function shopStatusKey(shop: ShopRowData): "active" | "setup_required" {
  const hasGps = shop.latitude != null && shop.longitude != null;
  if (!hasGps) return "setup_required";
  return "active";
}

export function formatShopCreatedDate(createdAt?: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_CLASS = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

const openScheduleBtn =
  "inline-flex items-center justify-center rounded-xl border border-[#2563EB] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] shadow-sm transition hover:bg-blue-50";

function RowMoreMenu({
  onEdit,
  onDelete,
  scheduleMode,
}: {
  onEdit: () => void;
  onDelete: () => void;
  scheduleMode?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("shops.moreActions")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#64748B] transition hover:bg-slate-50"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
          {scheduleMode ? (
            <Link
              href="/admin/shops"
              className="block px-4 py-2 text-left text-sm font-medium text-[#0F172A] hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              {t("shops.shopSettings")}
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm font-medium text-[#0F172A] hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                {t("shops.editShop")}
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                {t("shops.deleteShop")}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatColumn({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[5rem] text-center">
      <p className="text-xl font-bold tabular-nums text-[#0F172A]">{value}</p>
      <p className="mt-0.5 text-xs text-[#64748B]">{label}</p>
    </div>
  );
}

type Props = {
  shop: ShopRowData;
  stats: ShopRowStats;
  isHeadOffice?: boolean;
  expanded?: boolean;
  scheduleMode?: boolean;
  onOpenSchedule: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function ShopListRow({
  shop,
  stats,
  isHeadOffice,
  expanded,
  scheduleMode,
  onOpenSchedule,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const statusKey = shopStatusKey(shop);
  const statusTone = statusKey === "active" ? "success" : "warning";
  const statusLabel = displayShopSetupStatus(t, statusKey);
  const address = shopAddressLabel(shop, t("shops.locationNotSet"));
  const created = formatShopCreatedDate(shop.created_at);

  return (
    <article className={`${dashboardCard} p-4 transition-shadow hover:shadow-md sm:p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-50">
            <ShopPhotoDisplay shopId={shop.id} shopName={shop.name} className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-[#0F172A]">{shop.name}</h2>
              {isHeadOffice ? (
                <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#2563EB] ring-1 ring-blue-100">
                  {t("shops.headOffice")}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-[#64748B]">{address}</p>
            {created ? (
              <p className="mt-1 text-xs text-[#94A3B8]">
                {t("shops.created")}: {created}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-start lg:gap-8">
          <StatColumn label={t("shops.employees")} value={stats.employeeCount} />
          <StatColumn label={t("shops.activeShifts")} value={stats.activeShiftsToday} />
          <div className="min-w-[5rem] text-center">
            <p className="text-xs text-[#64748B]">{t("shops.status")}</p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[statusTone]}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:shrink-0">
          <button type="button" onClick={onOpenSchedule} className={openScheduleBtn}>
            {expanded ? t("shops.closeSchedule") : t("shops.openSchedule")}
          </button>
          {!scheduleMode ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50 sm:text-sm"
            >
              {t("shops.edit")}
            </button>
          ) : null}
          <RowMoreMenu onEdit={onEdit} onDelete={onDelete} scheduleMode={scheduleMode} />
        </div>
      </div>
    </article>
  );
}

export type ShopCardData = ShopRowData;
export type ShopCardStats = ShopRowStats;
