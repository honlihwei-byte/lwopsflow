export type Locale = "en" | "zh" | "ms";

export const PREFERRED_LANGUAGE_KEY = "preferred_language";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "BM" },
];

export type TranslationTree = {
  [key: string]: string | TranslationTree;
};
