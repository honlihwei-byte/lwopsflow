"use client";

import { type DayIssueStats, type IssueBadgeType } from "@/lib/attendance-report";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateIssueBadge } from "@/lib/i18n/attendance-ui";

const BADGE_STYLES: Record<IssueBadgeType, string> = {
  missing_clock_out: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  missing_clock_in: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  missing_punch: "bg-red-50 text-red-700 ring-1 ring-red-200",
  open_shift: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  weak_indoor: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200",
  expanded_radius: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  review_required: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  rejected_gps: "bg-red-50 text-red-700 ring-1 ring-red-200",
  photo_proof: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  manual_approved: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  duplicate_prevented: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200",
  duplicate_punch: "bg-red-50 text-red-700 ring-1 ring-red-200",
  suspicious_punch_sequence: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
  trusted_device: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  new_device: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  device_mismatch: "bg-red-50 text-red-700 ring-1 ring-red-200",
  buddy_punch: "bg-red-50 text-red-700 ring-1 ring-red-200",
  random_selfie: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200",
  selfie_proof: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  high_risk: "bg-red-100 text-red-800 ring-1 ring-red-300",
};

export function IssueBadges({
  issues,
  compact,
  onBadgeClick,
}: {
  issues: DayIssueStats;
  compact?: boolean;
  onBadgeClick?: (badge: IssueBadgeType) => void;
}) {
  const { t } = useI18n();

  const allowed = new Set<IssueBadgeType>([
    "open_shift",
    "missing_clock_in",
    "missing_clock_out",
    "duplicate_punch",
    "suspicious_punch_sequence",
    "manual_approved",
    "rejected_gps",
    "review_required",
    "photo_proof",
    "high_risk",
    "new_device",
    "device_mismatch",
    "buddy_punch",
  ]);
  const badges = issues.badges.filter((b) => allowed.has(b));

  if (badges.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "max-w-[220px]"}`}>
      {badges.map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onBadgeClick?.(b)}
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold leading-tight sm:text-[11px] ${BADGE_STYLES[b]} ${
            onBadgeClick ? "transition hover:opacity-90" : ""
          }`}
          title={onBadgeClick ? t("attendance.clickForDetails") : undefined}
        >
          {translateIssueBadge(t, b, compact)}
        </button>
      ))}
    </div>
  );
}
