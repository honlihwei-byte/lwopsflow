"use client";

import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function PhotoProofFallbackField({ checked, onChange, disabled }: Props) {
  const { t } = useI18n();

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-3 dark:border-violet-900 dark:bg-violet-950/30">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-zinc-300"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {t("shops.editForm.photoProof.title")}
          <HelpInfoIcon helpKey="photoProofFallback" />
        </span>
        <span className="mt-1 block text-xs font-normal text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.photoProof.desc")}
        </span>
      </span>
    </label>
  );
}
