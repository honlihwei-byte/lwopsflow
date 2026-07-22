"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PermissionKey } from "@/lib/permissions/keys";
import {
  clientCanAccessShop,
  clientCanViewModule,
  clientHasAnyPermission,
  clientHasPermission,
  type EmployeePermissionSnapshot,
} from "@/lib/permissions/permissions-client";
import {
  filterNavByPermissions,
  type OpsModuleId,
  type OpsNavItem,
} from "@/lib/permissions/nav-modules";
import { isLocale, storeLocale, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n/LanguageProvider";

export type EmployeeSessionPayload = EmployeePermissionSnapshot & {
  authenticated: boolean;
  staff_id?: string;
  staff_name?: string;
  company_id?: string;
  company_name?: string;
  position_name?: string | null;
  assigned_shops?: Array<{ id: string; name: string }>;
  preferred_locale?: Locale;
};

type Ctx = {
  session: EmployeeSessionPayload | null;
  ready: boolean;
  refresh: () => Promise<void>;
  navItems: OpsNavItem[];
  hasPermission: (key: PermissionKey) => boolean;
  hasAnyPermission: (keys: PermissionKey[]) => boolean;
  canAccessShop: (shopId: string) => boolean;
  canViewModule: (moduleId: OpsModuleId) => boolean;
};

const EmployeePermissionContext = createContext<Ctx | null>(null);

export function EmployeePermissionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession?: EmployeeSessionPayload | null;
}) {
  const { setLocale } = useI18n();
  const [session, setSession] = useState<EmployeeSessionPayload | null>(
    initialSession ?? null,
  );
  const [ready, setReady] = useState(Boolean(initialSession));

  const refresh = useCallback(async () => {
    const res = await fetch("/api/employee/auth/session", { credentials: "include" });
    const j = (await res.json()) as EmployeeSessionPayload;
    setSession(j.authenticated ? j : null);
    if (j.authenticated && j.preferred_locale && isLocale(j.preferred_locale)) {
      setLocale(j.preferred_locale);
      storeLocale(j.preferred_locale);
    }
    setReady(true);
  }, [setLocale]);

  useEffect(() => {
    if (!initialSession) void refresh();
  }, [initialSession, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const permissions = session?.effective_permissions ?? {};

  const value = useMemo<Ctx>(() => {
    const snapshot: EmployeePermissionSnapshot = {
      effective_permissions: permissions,
      shop_scope: session?.shop_scope ?? "assigned_only",
      scope_shop_ids: session?.scope_shop_ids ?? [],
      assigned_shop_ids: session?.assigned_shop_ids ?? [],
      role_template: session?.role_template ?? "staff",
    };

    return {
      session,
      ready,
      refresh,
      navItems: filterNavByPermissions(permissions),
      hasPermission: (key) => clientHasPermission(permissions, key),
      hasAnyPermission: (keys) => clientHasAnyPermission(permissions, keys),
      canAccessShop: (shopId) => clientCanAccessShop(snapshot, shopId),
      canViewModule: (moduleId) => clientCanViewModule(snapshot, moduleId),
    };
  }, [session, ready, refresh, permissions]);

  return (
    <EmployeePermissionContext.Provider value={value}>
      {children}
    </EmployeePermissionContext.Provider>
  );
}

export function useEmployeePermissions(): Ctx {
  const ctx = useContext(EmployeePermissionContext);
  if (!ctx) {
    throw new Error("useEmployeePermissions must be used within EmployeePermissionProvider");
  }
  return ctx;
}
