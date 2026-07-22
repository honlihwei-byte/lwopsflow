"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useI18n } from "@/components/i18n/LanguageProvider";

type SessionInfo = {
  role: "super_admin" | "company_admin";
  feature_access?: "full" | "billing_only" | "blocked";
  company?: { name: string; code: string; status_label?: string };
};

type Props = {
  session: SessionInfo;
  onLogout: () => void;
  children: React.ReactNode;
};

export function AdminAppShell({ session, onLogout, children }: Props) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          aria-label={t("common.closeMenu")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <AdminSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        featureAccess={session.feature_access}
        company={session.company}
      />

      <div className="lg:pl-[240px]">
        <AdminHeader
          session={session}
          onLogout={onLogout}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main>{children}</main>
      </div>
    </div>
  );
}
