"use client";

import { type RiskBadgeType } from "@/lib/attendance-risk-badges";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateRiskBadge } from "@/lib/i18n/attendance-ui";

const STYLES: Record<RiskBadgeType, string> = {
  trusted_device: "border-emerald-200 bg-emerald-50 text-emerald-800",
  new_device: "border-sky-200 bg-sky-50 text-sky-800",
  device_mismatch: "border-red-200 bg-red-50 text-red-800",
  buddy_punch: "border-red-200 bg-red-50 text-red-800",
  weak_gps: "border-amber-200 bg-amber-50 text-amber-900",
  random_selfie: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  selfie_proof: "border-sky-200 bg-sky-50 text-sky-800",
  high_risk: "border-rose-300 bg-rose-50 text-rose-900",
};

const SCORE_TONE: Record<RiskBadgeType, string> = {
  trusted_device: "bg-emerald-100 text-emerald-800",
  new_device: "bg-sky-100 text-sky-800",
  device_mismatch: "bg-red-100 text-red-800",
  buddy_punch: "bg-red-100 text-red-800",
  weak_gps: "bg-amber-100 text-amber-900",
  random_selfie: "bg-fuchsia-100 text-fuchsia-800",
  selfie_proof: "bg-sky-100 text-sky-800",
  high_risk: "bg-rose-200 text-rose-900",
};

export function RiskBadges({
  badges,
  compact,
  riskScore,
}: {
  badges: RiskBadgeType[];
  compact?: boolean;
  riskScore?: number;
}) {
  const { t } = useI18n();

  if (badges.length === 0) return null;

  const score = riskScore ?? 0;

  return (
    <span className={`inline-flex flex-wrap gap-1.5 ${compact ? "" : "mt-1"}`}>
      {badges.map((b) => (
        <span
          key={b}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STYLES[b]}`}
        >
          <span>{translateRiskBadge(t, b)}</span>
          {score > 0 ? (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SCORE_TONE[b]}`}>
              {t("attendance.score").replace("{score}", String(score))}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
