"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { isEmployeeAppHost } from "@/lib/app-url";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  EmployeePermissionProvider,
  useEmployeePermissions,
} from "@/components/employee/EmployeePermissionProvider";
import type { OpsModuleId } from "@/lib/permissions/nav-modules";

const MOBILE_BOTTOM_NAV: Array<{
  id: OpsModuleId | "dashboard";
  href: string;
  labelKey: string;
  match: (pathname: string) => boolean;
}> = [
  {
    id: "dashboard",
    href: "/employee/dashboard",
    labelKey: "employee.nav.dashboard",
    match: (p) => p === "/employee/dashboard" || p === "/employee",
  },
  {
    id: "clock",
    href: "/employee/clock",
    labelKey: "employee.nav.clock",
    match: (p) => p.startsWith("/employee/clock"),
  },
  {
    id: "my_tasks",
    href: "/employee/tasks",
    labelKey: "employee.nav.tasks",
    match: (p) => p.startsWith("/employee/tasks"),
  },
  {
    id: "my_attendance",
    href: "/employee/attendance",
    labelKey: "employee.nav.schedule",
    match: (p) => p.startsWith("/employee/attendance"),
  },
  {
    id: "account_settings",
    href: "/employee/settings",
    labelKey: "employee.nav.account",
    match: (p) => p.startsWith("/employee/settings"),
  },
];

function EmployeeShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { session, ready, navItems, refresh } = useEmployeePermissions();
  const [unread, setUnread] = useState(0);
  const [shopsOpen, setShopsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!session?.authenticated) return;
    void fetch("/api/employee/notifications?count_only=true", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { unread?: number }) => setUnread(j.unread ?? 0))
      .catch(() => {});
  }, [session?.authenticated, pathname]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/employee/auth/logout", { method: "POST", credentials: "include" });
    const loginPath =
      typeof window !== "undefined" && isEmployeeAppHost(window.location.host)
        ? "/login"
        : "/employee/login";
    router.push(loginPath);
  }, [router]);

  const bottomNavItems = useMemo(() => {
    const allowed = new Set(navItems.map((n) => n.id));
    return MOBILE_BOTTOM_NAV.filter(
      (item) =>
        item.id === "dashboard" ||
        item.id === "clock" ||
        item.id === "account_settings" ||
        allowed.has(item.id as OpsModuleId),
    );
  }, [navItems]);

  const desktopNavItems = useMemo(() => {
    const dashboardLink = {
      id: "dashboard" as const,
      href: "/employee/dashboard",
      labelKey: "employee.nav.dashboard",
      match: (p: string) => p === "/employee/dashboard" || p === "/employee",
      permissions: [] as const,
      personal: true,
    };
    const hasEmployeeDashboard = navItems.some(
      (n) => n.href === "/employee/dashboard" || n.id === "dashboard",
    );
    return hasEmployeeDashboard ? navItems : [dashboardLink, ...navItems];
  }, [navItems]);

  const assignedShops = session?.assigned_shops ?? [];
  const todayShopName = assignedShops[0]?.name ?? null;

  if (!ready) {
    return <p className="p-6 text-sm text-zinc-500">{t("employee.dashboard.loading")}</p>;
  }

  if (!session?.authenticated) return null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto max-w-5xl px-3 py-2.5 sm:px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {session.staff_name}
              </p>
              {session.position_name ? (
                <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {session.position_name}
                </p>
              ) : null}
              {todayShopName ? (
                <p className="mt-0.5 truncate text-sm text-emerald-700 dark:text-emerald-400">
                  {t("employee.profile.todayShop")}: {todayShopName}
                </p>
              ) : null}
              {assignedShops.length > 1 ? (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setShopsOpen((v) => !v)}
                    className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
                  >
                    {t("employee.profile.viewShops")} ({assignedShops.length})
                  </button>
                  {shopsOpen ? (
                    <ul className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {assignedShops.map((s) => (
                        <li key={s.id} className="truncate">
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : assignedShops.length === 1 ? null : (
                <p className="mt-0.5 text-sm text-zinc-500">{t("employee.profile.noShopsAssigned")}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <NotificationBell mode="employee" listHref="/employee/notifications" />
              <LanguageSelector />
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Refresh permissions"
                >
                  ↻
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 sm:hidden dark:text-zinc-300"
                aria-label="Menu"
              >
                ⋮
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="hidden rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 sm:inline dark:text-zinc-400"
              >
                {t("employee.nav.logout")}
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2 sm:hidden dark:border-zinc-800">
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-lg px-2 py-2 text-left text-sm font-medium text-red-600"
              >
                {t("employee.nav.logout")}
              </button>
            </div>
          ) : null}
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-4 pb-2 md:flex">
          {desktopNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                item.match(pathname)
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
              ].join(" ")}
            >
              {t(item.labelKey)}
              {item.id === "notifications" && unread > 0 ? ` (${unread})` : ""}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-4 md:pb-4">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Employee navigation"
      >
        <div
          className="mx-auto grid max-w-lg gap-0"
          style={{ gridTemplateColumns: `repeat(${bottomNavItems.length}, minmax(0, 1fr))` }}
        >
          {bottomNavItems.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-center",
                  "touch-manipulation text-[11px] font-semibold leading-tight",
                  active
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-600 dark:text-zinc-400",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-base",
                    active ? "bg-emerald-100 dark:bg-emerald-950/50" : "",
                  ].join(" ")}
                  aria-hidden
                >
                  {item.id === "dashboard"
                    ? "⌂"
                    : item.id === "clock"
                      ? "⏱"
                      : item.id === "my_tasks"
                        ? "✓"
                        : item.id === "my_attendance"
                          ? "📅"
                          : "⚙"}
                </span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function EmployeeSessionGateInner({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const router = useRouter();
  const { session, ready } = useEmployeePermissions();

  useEffect(() => {
    if (!ready || session?.authenticated) return;
    const next = encodeURIComponent(pathname);
    const loginPath =
      typeof window !== "undefined" && isEmployeeAppHost(window.location.host)
        ? "/login"
        : "/employee/login";
    router.replace(`${loginPath}?next=${next}`);
  }, [ready, session?.authenticated, router, pathname]);

  if (!ready || !session?.authenticated) {
    return null;
  }

  return <EmployeeShell>{children}</EmployeeShell>;
}

export function EmployeeSessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <EmployeePermissionProvider>
      <EmployeeSessionGateInner pathname={pathname}>{children}</EmployeeSessionGateInner>
    </EmployeePermissionProvider>
  );
}
