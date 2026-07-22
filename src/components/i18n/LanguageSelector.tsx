"use client";

import { LOCALES } from "@/lib/i18n";
import { useI18n } from "./LanguageProvider";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm font-medium text-[#0F172A] shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 ${className}`}
    >
      <span className="select-none text-base leading-none" aria-hidden>
        {t("language.globe")}
      </span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="max-w-[7.5rem] cursor-pointer appearance-none bg-transparent pr-1 text-sm font-semibold outline-none"
        aria-label={t("language.selectorAria")}
      >
        {LOCALES.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
