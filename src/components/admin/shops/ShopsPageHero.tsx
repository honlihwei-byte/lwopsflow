"use client";

import Link from "next/link";
import { dashboardCard } from "@/components/admin/report/dashboard-ui";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function ShopsPageHero() {
  const { t } = useI18n();

  return (
    <section
      className={`${dashboardCard} relative overflow-hidden border-blue-100 bg-gradient-to-r from-blue-50 via-sky-50/80 to-white p-5 sm:p-6`}
    >
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-[#2563EB]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0F172A] sm:text-lg">{t("shops.heroTitle")}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#64748B]">{t("shops.heroDesc")}</p>
            <Link
              href="/help/getting-started"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline"
            >
              {t("common.learnMore")}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
        <div className="hidden shrink-0 sm:block" aria-hidden>
          <svg viewBox="0 0 120 100" className="h-24 w-28 text-[#2563EB]/20">
            <rect x="20" y="35" width="80" height="55" rx="6" fill="currentColor" opacity="0.35" />
            <path d="M10 40 L60 15 L110 40 Z" fill="currentColor" opacity="0.5" />
            <rect x="48" y="60" width="24" height="30" rx="2" fill="white" opacity="0.9" />
            <rect x="30" y="48" width="16" height="14" rx="2" fill="white" opacity="0.7" />
            <rect x="74" y="48" width="16" height="14" rx="2" fill="white" opacity="0.7" />
          </svg>
        </div>
      </div>
    </section>
  );
}
