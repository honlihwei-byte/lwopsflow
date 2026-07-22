"use client";

import Link from "next/link";
import { OperationsDashboard } from "@/components/admin/OperationsDashboard";
import { useI18n } from "@/components/i18n/LanguageProvider";

const QUICK_ACTIONS = [
  { href: "/admin/attendance", titleKey: "dashboard.quickDaily.title", descKey: "dashboard.quickDaily.desc" },
  { href: "/admin/shift-schedule", titleKey: "dashboard.quickSchedule.title", descKey: "dashboard.quickSchedule.desc" },
  { href: "/admin/shops", titleKey: "dashboard.quickShops.title", descKey: "dashboard.quickShops.desc" },
  { href: "/admin/staff", titleKey: "nav.staff", descKey: "staff.subtitle" },
  { href: "/admin/tasks", titleKey: "nav.tasks", descKey: "tasks.subtitle" },
] as const;

export function AdminDashboard() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
          {t("dashboard.operations.title")}
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">
          {t("dashboard.operations.performance.subtitle")}
        </p>
      </header>

      <OperationsDashboard />

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#0F172A]">
          {t("dashboard.operations.quickActions")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm transition hover:border-[#2563EB]/30 hover:shadow-md"
            >
              <p className="text-sm font-semibold text-[#2563EB]">{t(action.titleKey)}</p>
              <p className="mt-1 text-xs text-[#64748B]">{t(action.descKey)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
