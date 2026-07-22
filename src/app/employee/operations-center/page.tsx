"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { OperationsCenterFeed } from "@/components/employee/operations-center/OperationsCenterFeed";

export default function EmployeeOperationsCenterPage() {
  const { t } = useI18n();

  return (
    <EmployeeSessionGate>
      <div className="space-y-3">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {t("operationsCenter.employee.sectionTitle")}
        </h1>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <OperationsCenterFeed />
        </div>
        <Link href="/employee/dashboard" className="block text-sm font-semibold text-violet-600">
          ← {t("employee.nav.dashboard")}
        </Link>
      </div>
    </EmployeeSessionGate>
  );
}
