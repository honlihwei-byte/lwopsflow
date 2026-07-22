"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type NavSession = {
  role: "super_admin" | "company_admin";
  feature_access?: "full" | "billing_only" | "blocked";
  company?: { name: string; code: string; status_label?: string };
};

type Props = {
  session: NavSession;
  onLogout: () => void;
};

function NavButton({
  href,
  children,
  onClick,
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const cls =
    "inline-flex shrink-0 items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
  if (href) {
    return (
      <a href={href} className={cls} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

function ProfileMenu({ onLogout, onNavigate }: { onLogout: () => void; onNavigate: () => void }) {
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
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Account
        <span className="text-xs opacity-60" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <a
            href="/admin/profile"
            role="menuitem"
            className="block px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
          >
            Company Profile
          </a>
          <a
            href="/admin/billing"
            role="menuitem"
            className="block px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
          >
            Billing
          </a>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminTopNav({ session, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [session.role, session.company?.name]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const showDashboard = session.role === "company_admin" && session.feature_access === "full";
  const showCompanyMenu = session.role === "company_admin";
  const showPlatform = session.role === "super_admin";

  const navItems = (
    <>
      {showDashboard ? <NavButton href="/admin" onClick={closeMobile}>Dashboard</NavButton> : null}
      {showCompanyMenu ? (
        <NavButton href="/help" onClick={closeMobile}>
          Help Center
        </NavButton>
      ) : null}
      {showCompanyMenu ? (
        <NavButton href="/admin/billing" onClick={closeMobile}>
          Billing
        </NavButton>
      ) : null}
      {showCompanyMenu ? (
        <div className="hidden lg:block">
          <ProfileMenu
            onLogout={() => {
              closeMobile();
              onLogout();
            }}
            onNavigate={closeMobile}
          />
        </div>
      ) : null}
      {showPlatform ? <NavButton href="/super-admin" onClick={closeMobile}>Platform</NavButton> : null}
      {showPlatform ? (
        <NavButton
          onClick={() => {
            closeMobile();
            onLogout();
          }}
        >
          Logout
        </NavButton>
      ) : null}
    </>
  );

  const mobileCompanyItems = showCompanyMenu ? (
    <>
      <NavButton href="/help" onClick={closeMobile}>
        Help Center
      </NavButton>
      <NavButton href="/admin/profile" onClick={closeMobile}>
        Company Profile
      </NavButton>
      <NavButton href="/admin/billing" onClick={closeMobile}>
        Billing
      </NavButton>
      <NavButton
        onClick={() => {
          closeMobile();
          onLogout();
        }}
      >
        Logout
      </NavButton>
    </>
  ) : null;

  const logoHref =
    session.role === "super_admin" ? "/super-admin" : showDashboard ? "/admin" : "/admin/billing";

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 shrink-0 items-center overflow-hidden">
          <BrandLogo href={logoHref} size="nav-mobile" className="sm:hidden" />
          <BrandLogo href={logoHref} size="nav" className="hidden sm:inline-flex" />
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 overflow-hidden">
          {session.role === "company_admin" && session.company ? (
            <>
              <span
                className="max-w-[180px] truncate rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[240px]"
                title={session.company.name}
              >
                {session.company.name}
              </span>
              <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-100">
                Company Admin
              </span>
              {session.company.status_label ? (
                <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-900 dark:bg-green-950 dark:text-green-100">
                  {session.company.status_label}
                </span>
              ) : null}
            </>
          ) : (
            <span className="shrink-0 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-100">
              Super Admin
            </span>
          )}
        </div>

        <nav
          className="hidden min-w-0 flex-wrap items-center justify-end gap-2 lg:flex"
          aria-label="Admin navigation"
        >
          {showCompanyMenu ? (
            <NotificationBell mode="admin" listHref="/admin/notifications" />
          ) : null}
          {navItems}
        </nav>

        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 lg:hidden dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          aria-expanded={mobileOpen}
          aria-controls="admin-mobile-menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span aria-hidden="true">☰</span> Menu
        </button>
      </div>

      {mobileOpen ? (
        <nav
          id="admin-mobile-menu"
          className="mx-auto mt-3 flex max-w-7xl flex-col gap-2 border-t border-zinc-100 pt-3 lg:hidden dark:border-zinc-800"
          aria-label="Admin mobile navigation"
        >
          {showDashboard ? <NavButton href="/admin" onClick={closeMobile}>Dashboard</NavButton> : null}
      {showCompanyMenu ? (
        <NavButton href="/help" onClick={closeMobile}>
          Help Center
        </NavButton>
      ) : null}
          {mobileCompanyItems}
          {showPlatform ? <NavButton href="/super-admin" onClick={closeMobile}>Platform</NavButton> : null}
          {showPlatform ? (
            <NavButton
              onClick={() => {
                closeMobile();
                onLogout();
              }}
            >
              Logout
            </NavButton>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
