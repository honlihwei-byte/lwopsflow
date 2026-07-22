"use client";

import { dashboardPrimaryBtn } from "@/components/admin/report/dashboard-ui";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  onAddShop: () => void;
};

export function ShopsBottomCta({ onAddShop }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#E2E8F0] bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-lg font-bold text-white">
          +
        </div>
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">{t("shops.cantFindShop")}</p>
          <p className="mt-0.5 text-sm text-[#64748B]">{t("shops.cantFindShopDesc")}</p>
        </div>
      </div>
      <button type="button" onClick={onAddShop} className={`${dashboardPrimaryBtn} shrink-0`}>
        {t("shops.addNewShop")}
      </button>
    </div>
  );
}
