"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { useEmployeePermissions } from "@/components/employee/EmployeePermissionProvider";
import type { OpsModuleId } from "@/lib/permissions/nav-modules";

export function AccessRestricted() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/30">
      <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
        {t("employee.permission.title")}
      </h2>
      <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
        {t("employee.permission.body")}
      </p>
      <Link
        href="/employee/dashboard"
        className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        {t("employee.permission.back")}
      </Link>
    </div>
  );
}

export function EmployeePermissionGuard({
  moduleId,
  children,
}: {
  moduleId: OpsModuleId;
  children: React.ReactNode;
}) {
  const { ready, canViewModule } = useEmployeePermissions();

  if (!ready) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (!canViewModule(moduleId)) {
    return <AccessRestricted />;
  }

  return <>{children}</>;
}
