"use client";

import { useState } from "react";
import type { HelpPageId } from "@/lib/help/page-guides";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { usePageGuide } from "@/components/help/usePageGuide";

export function PageGuide({ pageId }: { pageId: HelpPageId }) {
  const { t } = useI18n();
  const guide = usePageGuide(pageId);
  const [open, setOpen] = useState(true);

  if (!guide) return null;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-blue-950 dark:text-blue-100">
          {t("guide.label")}: {guide.title}
        </span>
        <span className="text-xs text-blue-800/80 dark:text-blue-200/80">
          {open ? t("guide.hide") : t("guide.show")}
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-blue-200/80 px-4 pb-4 pt-3 text-sm text-blue-950/90 dark:border-blue-900/50 dark:text-blue-100/90">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
              {t("guide.whatThisPageDoes")}
            </p>
            <p className="mt-1">{guide.what}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
              {t("guide.whyItMatters")}
            </p>
            <p className="mt-1">{guide.why}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
              {t("guide.howToUseIt")}
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {guide.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
              {t("guide.bestPractices")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {guide.bestPractices.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs">
            {t("guide.moreHelp")}{" "}
            <a href="/help/getting-started" className="font-semibold underline">
              {t("guide.quickStart")}
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}
