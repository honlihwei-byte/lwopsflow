"use client";

import { useId, useState } from "react";
import type { ContextualHelpKey } from "@/lib/help/contextual-tooltips";
import { useI18n } from "@/components/i18n/LanguageProvider";

export function HelpInfoIcon({
  helpKey,
  label,
}: {
  helpKey: ContextualHelpKey;
  label?: string;
}) {
  const { t } = useI18n();
  const text = t(`help.contextual.${helpKey}`);
  const ariaLabel = label ?? t("guide.moreInfo");
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-50 text-[11px] font-bold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        ⓘ
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
