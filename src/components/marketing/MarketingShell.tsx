"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { btnPrimary, btnSecondary } from "./marketing-buttons";
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE_TEL,
  SUPPORT_WHATSAPP_DISPLAY,
} from "@/lib/support-contact";

export { btnPrimary, btnSecondary } from "./marketing-buttons";

export function MarketingShell({
  children,
  narrow,
  hideFooter,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  hideFooter?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <BrandLogo href="/" size="nav-mobile" className="sm:hidden" priority />
          <BrandLogo href="/" size="nav" className="hidden sm:inline-flex" priority />
          <nav className="flex shrink-0 items-center gap-1.5 text-sm font-semibold sm:gap-2">
            <LanguageSelector />
            <Link
              href="/login"
              className={btnSecondary("shrink-0 px-3 py-2 text-xs sm:px-4 sm:text-sm")}
            >
              {t("marketing.companyLogin")}
            </Link>
            <Link
              href="/register"
              className={btnPrimary("shrink-0 px-3 py-2 text-xs sm:px-4 sm:text-sm")}
            >
              {t("marketing.startFreeTrial")}
            </Link>
          </nav>
        </div>
      </header>

      <main className={`mx-auto px-4 py-8 sm:px-6 sm:py-12 ${narrow ? "max-w-lg" : "max-w-6xl"}`}>
        {children}
      </main>

      {!hideFooter ? (
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-[#0F172A]">{t("common.brandName")}</p>
              <p className="mt-1 max-w-xs text-sm text-[#64748B]">{t("common.smartWorkforce")}</p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-[#64748B]">
              <a href="#features" className="hover:text-[#2563EB]">
                {t("marketing.features")}
              </a>
              <a href="#pricing" className="hover:text-[#2563EB]">
                {t("marketing.pricing")}
              </a>
              <a href="#faq" className="hover:text-[#2563EB]">
                {t("marketing.faq")}
              </a>
              <Link href="/register" className="hover:text-[#2563EB]">
                {t("marketing.startFreeTrial")}
              </Link>
              <a href="#contact" className="hover:text-[#2563EB]">
                {t("marketing.contact")}
              </a>
            </nav>
            <div id="contact" className="text-sm text-[#64748B]">
              <p className="font-semibold text-[#0F172A]">{t("marketing.contact")}</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <span className="font-medium text-[#0F172A]">{t("marketing.phoneWhatsApp")}</span>{" "}
                  <a href={`tel:${SUPPORT_PHONE_TEL}`} className="hover:text-[#2563EB]">
                    {SUPPORT_WHATSAPP_DISPLAY}
                  </a>
                </li>
                <li>
                  <span className="font-medium text-[#0F172A]">{t("marketing.email")}</span>{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-[#2563EB]">
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <span className="font-medium text-[#0F172A]">{t("marketing.businessHours")}</span>{" "}
                  {t("marketing.businessHoursValue")}
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-200 py-4 text-center text-xs text-[#64748B]">
            {t("common.allRightsReserved")}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
