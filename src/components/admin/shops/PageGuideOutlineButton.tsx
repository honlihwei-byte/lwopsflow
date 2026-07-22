"use client";

import { useState } from "react";
import type { HelpPageId } from "@/lib/help/page-guides";
import { dashboardSecondaryBtn } from "@/components/admin/report/dashboard-ui";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { usePageGuide } from "@/components/help/usePageGuide";

export function PageGuideOutlineButton({ pageId }: { pageId: HelpPageId }) {
  const { t } = useI18n();
  const guide = usePageGuide(pageId);
  const [open, setOpen] = useState(false);

  if (!guide) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${dashboardSecondaryBtn} gap-2`}
        aria-expanded={open}
      >
        <svg className="h-4 w-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        {t("guide.label")}: {guide.title}
      </button>
      {open ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-4 text-sm text-blue-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/70">
            {t("guide.whatThisPageDoes")}
          </p>
          <p className="mt-1">{guide.what}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-800/70">
            {t("guide.howToUseIt")}
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {guide.how.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
