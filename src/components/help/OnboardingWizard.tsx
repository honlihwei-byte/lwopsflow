"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

const STEP_HREFS = [
  "/admin/shops",
  "/admin/shops",
  "/admin/staff",
  "/admin/shops",
  "/admin",
] as const;

const STEP_COUNT = 5;

export function OnboardingWizard() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/onboarding", { credentials: "include" });
      const j = (await res.json()) as { show_wizard?: boolean };
      if (res.ok && j.show_wizard) setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(action: "skip" | "complete") {
    setDismissing(true);
    try {
      await fetch("/api/company/onboarding", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setVisible(false);
      setDismissing(false);
    }
  }

  if (!visible) return null;

  const stepKey = String(step);
  const title = t(`onboarding.steps.${stepKey}.title`);
  const description = t(`onboarding.steps.${stepKey}.description`);
  const cta = t(`onboarding.steps.${stepKey}.cta`);
  const href = STEP_HREFS[step] ?? "/admin";
  const isLast = step === STEP_COUNT - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-wizard-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          {t("onboarding.welcome")}
        </p>
        <h2 id="onboarding-wizard-title" className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t("onboarding.wizardTitle")
            .replace("{step}", String(step + 1))
            .replace("{total}", String(STEP_COUNT))}
        </h2>
        <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>

        <div className="mt-4 flex gap-1">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-700"}`}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={href}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => void dismiss("complete")}
          >
            {cta}
          </Link>
          {!isLast ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
              disabled={dismissing}
              onClick={() => setStep((s) => Math.min(s + 1, STEP_COUNT - 1))}
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
              disabled={dismissing}
              onClick={() => void dismiss("complete")}
            >
              {t("onboarding.finish")}
            </button>
          )}
          <button
            type="button"
            className="ml-auto text-sm font-medium text-zinc-500 underline"
            disabled={dismissing}
            onClick={() => void dismiss("skip")}
          >
            {t("onboarding.skip")}
          </button>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          {t("onboarding.fullWalkthrough")}:{" "}
          <Link href="/help/getting-started" className="font-semibold text-blue-600 underline">
            {t("guide.quickStart")}
          </Link>
        </p>
      </div>
    </div>
  );
}
