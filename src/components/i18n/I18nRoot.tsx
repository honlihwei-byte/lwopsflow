"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "./LanguageProvider";

export function I18nRoot({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
