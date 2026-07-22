"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

const TRUST_KEYS = [
  "register.trustQr",
  "register.trustSchedule",
  "register.trustGps",
  "register.trustMultiShop",
  "register.trustReports",
] as const;

export function RegisterTrustPanel() {
  const { t } = useI18n();

  return (
    <aside className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-zinc-950 lg:sticky lg:top-24">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("register.trustTitle")}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
        {TRUST_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400" aria-hidden>
              ✓
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
