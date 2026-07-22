import type { Locale } from "./types";

const warnedKeys = new Set<string>();

/** Dev-only: log when a non-English locale falls back to English catalog. */
export function isI18nAuditEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_I18N_AUDIT === "1") {
    return true;
  }
  return typeof process !== "undefined" && process.env.NODE_ENV === "development";
}

export function auditMissingTranslation(locale: Locale, key: string, hadPrimary: boolean): void {
  if (!isI18nAuditEnabled()) return;
  if (locale === "en") return;
  if (hadPrimary) return;
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  const enHint =
    typeof window !== "undefined"
      ? ""
      : " (add zh/ms under this key in admin-pages-*.ts or locale catalog)";
  console.warn(`[i18n missing] ${key}${enHint}`);
}

/** Warn when UI shows a raw English literal while locale is not English (opt-in via data attribute). */
export function auditDisplayedEnglishLiteral(locale: Locale, text: string): void {
  if (!isI18nAuditEnabled()) return;
  if (locale === "en") return;
  const trimmed = text.trim();
  if (trimmed.length < 2) return;
  if (!/[a-zA-Z]/.test(trimmed)) return;
  console.warn("[i18n missing]", trimmed);
}
