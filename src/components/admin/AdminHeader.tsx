"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { useI18n } from "@/components/i18n/LanguageProvider";

type SessionInfo = {
  role: "super_admin" | "company_admin";
  feature_access?: "full" | "billing_only" | "blocked";
  company?: { name: string; code: string; status_label?: string };
};

type Props = {
  session: SessionInfo;
  onLogout: () => void;
  onMenuClick: () => void;
};

function AccountMenu({ session, onLogout }: { session: SessionInfo; onLogout: () => void }) {
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

  const initials = session.company?.name
    ? session.company.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "SA";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-sm font-bold text-white shadow-sm transition hover:opacity-90"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={t("nav.account")}
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 min-w-[14rem] rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl">
          {session.company ? (
            <div className="border-b border-[#E2E8F0] px-4 pb-2.5 pt-2">
              <p className="truncate text-sm font-semibold text-[#0F172A]">{session.company.name}</p>
              <p className="text-xs text-[#64748B]">{session.company.code} · {t("nav.companyAdmin")}</p>
            </div>
          ) : null}
          <Link
            href="/admin/profile"
            className="block px-4 py-2.5 text-sm text-[#0F172A] hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            {t("nav.companyProfileShort")}
          </Link>
          <Link
            href="/admin/billing"
            className="block px-4 py-2.5 text-sm text-[#0F172A] hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            {t("nav.billing")}
          </Link>
          <div className="my-1 border-t border-[#E2E8F0]" />
          <button
            type="button"
            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            {t("nav.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminHeader({ session, onLogout, onMenuClick }: Props) {
  const { t } = useI18n();
  const handleLogout = useCallback(() => onLogout(), [onLogout]);

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-slate-100 lg:hidden"
          aria-label={t("common.openMenu")}
          onClick={onMenuClick}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Mobile: company name visible when sidebar is hidden */}
        {session.company ? (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F172A] lg:hidden">
            {session.company.name}
          </p>
        ) : (
          <div className="flex-1 lg:hidden">
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
              {t("nav.superAdmin")}
            </span>
          </div>
        )}

        <div className="hidden flex-1 lg:block" />

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSelector />
          {session.feature_access === "full" ? (
            <Link
              href="/help"
              className="hidden items-center rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#64748B] shadow-sm transition hover:bg-slate-50 sm:inline-flex"
            >
              {t("nav.helpCenter")}
            </Link>
          ) : null}
          <div className="hidden sm:block">
            <AccountMenu session={session} onLogout={handleLogout} />
          </div>
          <button
            type="button"
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#64748B] transition hover:bg-slate-50 sm:hidden"
            onClick={handleLogout}
          >
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
