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
import {
  DEFAULT_LOCALE,
  resolveInitialLocale,
  storeLocale,
  translate,
  type Locale,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(resolveInitialLocale());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const lang = locale === "zh" ? "zh" : locale === "ms" ? "ms" : "en";
    document.documentElement.lang = lang;
  }, [locale, hydrated]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

  const t = useCallback((key: string) => translate(locale, key), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}

/** Safe hook for optional provider (returns English t until hydrated). */
export function useI18nOptional(): I18nContextValue {
  const ctx = useContext(I18nContext);
  const fallbackT = useCallback((key: string) => translate(DEFAULT_LOCALE, key), []);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: fallbackT,
  };
}
