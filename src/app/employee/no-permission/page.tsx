"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function EmployeeNoPermissionPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">{t("employee.permission.title")}</h1>
      <p className="text-sm text-zinc-600">{t("employee.permission.body")}</p>
      <Link
        href="/employee/dashboard"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        {t("employee.permission.back")}
      </Link>
    </div>
  );
}
