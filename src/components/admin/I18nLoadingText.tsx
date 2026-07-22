"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

type LoadingKey =
  | "loading.staff"
  | "loading.shops"
  | "loading.form"
  | "loading.attendance"
  | "loading.billing"
  | "loading.generic";

export function I18nLoadingText({
  messageKey = "loading.generic",
  className = "px-4 py-8 text-sm text-zinc-500",
}: {
  messageKey?: LoadingKey;
  className?: string;
}) {
  const { t } = useI18n();
  return <p className={className}>{t(messageKey)}</p>;
}
