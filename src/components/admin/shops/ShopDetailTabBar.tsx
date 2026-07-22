"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

export type ShopDetailTabId = "general" | "qr" | "gps" | "schedule" | "security";

const TAB_IDS: ShopDetailTabId[] = ["general", "qr", "gps", "schedule", "security"];

type Props = {
  active: ShopDetailTabId;
  onChange: (tab: ShopDetailTabId) => void;
};

export function ShopDetailTabBar({ active, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div
      className="mb-5 flex flex-wrap gap-1 border-b border-[#E2E8F0] pb-0"
      role="tablist"
      aria-label={t("shops.detail.tabsAria")}
    >
      {TAB_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
            active === id
              ? "border border-b-0 border-[#E2E8F0] bg-white text-[#2563EB]"
              : "text-[#64748B] hover:text-[#0F172A]"
          }`}
        >
          {t(`shops.detail.tabs.${id}`)}
        </button>
      ))}
    </div>
  );
}
