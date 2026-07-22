"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { AdminAppShell } from "@/components/admin/AdminAppShell";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { OnboardingWizard } from "@/components/help/OnboardingWizard";

type SessionInfo = {
  authenticated: boolean;
  role?: "super_admin" | "company_admin";
  role_label?: string;
  feature_access?: "full" | "billing_only" | "blocked";
  company?: { name: string; code: string; status_label?: string };
};

const BILLING_ALLOWED_PREFIXES = [
  "/subscription-required",
  "/billing",
  "/admin/billing",
  "/login",
  "/admin/profile",
];

type Props = {
  children: React.ReactNode;
  requiredRole?: "company_admin" | "super_admin";
};

export function AdminSessionGate({ children, requiredRole = "company_admin" }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const loginPath = requiredRole === "super_admin" ? "/super-admin-login" : "/login";
  const isBillingPath = BILLING_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/auth/session", { credentials: "include" });
    const j = (await res.json()) as SessionInfo;
    setSession(j);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ready || session?.authenticated) return;
    const next = encodeURIComponent(pathname);
    router.replace(`${loginPath}?next=${next}`);
  }, [ready, session?.authenticated, router, loginPath, pathname]);

  useEffect(() => {
    if (!ready || !session?.authenticated || session.role !== "company_admin") return;
    if (session.feature_access !== "billing_only") return;
    if (!isBillingPath && pathname.startsWith("/admin")) {
      router.replace("/subscription-required");
    }
  }, [ready, session, isBillingPath, pathname, router]);

  useEffect(() => {
    if (!ready || !session?.authenticated || session.role !== "company_admin") return;
    if (session.feature_access === "full" && pathname === "/subscription-required") {
      router.replace("/admin");
    }
  }, [ready, session, pathname, router]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" });
    setSession({ authenticated: false });
    router.push(loginPath);
  }, [router, loginPath]);

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
        <p className="text-sm text-zinc-500">{t("session.loading")}</p>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
        <p className="text-sm text-zinc-500">{t("session.redirecting")}</p>
      </div>
    );
  }

  if (requiredRole === "super_admin" && session.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-zinc-600">Super Admin access required.</p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => router.push("/super-admin-login")}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (requiredRole === "company_admin" && session.role !== "company_admin") {
    router.replace("/super-admin");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {requiredRole === "company_admin" && session.role === "company_admin" ? (
        <AdminAppShell
          session={{
            role: session.role,
            feature_access: session.feature_access,
            company: session.company,
          }}
          onLogout={() => void handleLogout()}
        >
          {session.feature_access === "full" ? <OnboardingWizard /> : null}
          {children}
        </AdminAppShell>
      ) : (
        <>
          <AdminTopNav
            session={{
              role: session.role!,
              feature_access: session.feature_access,
              company: session.company,
            }}
            onLogout={() => void handleLogout()}
          />
          {session.feature_access === "full" ? <OnboardingWizard /> : null}
          <main>{children}</main>
        </>
      )}
    </div>
  );
}
