"use client";

import { useMemo } from "react";
import type { HelpPageId } from "@/lib/help/page-guides";
import { PAGE_GUIDE_META } from "@/lib/help/page-guide-meta";
import { useI18n } from "@/components/i18n/LanguageProvider";

export type ResolvedPageGuide = {
  title: string;
  what: string;
  why: string;
  how: string[];
  bestPractices: string[];
};

export function usePageGuide(pageId: HelpPageId): ResolvedPageGuide | null {
  const { t } = useI18n();
  const meta = PAGE_GUIDE_META[pageId];

  return useMemo(() => {
    if (!meta) return null;
    const base = `guide.pages.${pageId}`;
    const how = Array.from({ length: meta.how }, (_, i) => t(`${base}.how.${i}`));
    const bestPractices = Array.from({ length: meta.bp }, (_, i) => t(`${base}.bp.${i}`));
    return {
      title: t(`${base}.title`),
      what: t(`${base}.what`),
      why: t(`${base}.why`),
      how,
      bestPractices,
    };
  }, [pageId, meta.bp, meta.how, t]);
}
