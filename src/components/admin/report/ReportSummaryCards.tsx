"use client";

import type { ReportSummary } from "@/lib/attendance-report";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { dashboardCard } from "./dashboard-ui";

type KpiCard = {
  label: string;
  value: string;
  description: string;
  trend: string;
  trendTone: "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
};

const TREND_CLASS: Record<KpiCard["trendTone"], string> = {
  success: "text-[#22C55E] bg-emerald-50",
  warning: "text-[#F59E0B] bg-amber-50",
  danger: "text-[#EF4444] bg-red-50",
  neutral: "text-slate-500 bg-slate-100",
};

function UsersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

export function ReportSummaryCards({ summary }: { summary: ReportSummary }) {
  const { t } = useI18n();

  const cards: KpiCard[] = [
    {
      label: t("attendance.kpi.presentStaffLabel"),
      value: String(summary.total_present_staff),
      description: t("attendance.kpi.presentStaffDesc"),
      trend:
        summary.total_present_staff > 0
          ? t("attendance.kpi.presentStaffTrendActive")
          : t("attendance.kpi.presentStaffTrendNone"),
      trendTone: summary.total_present_staff > 0 ? "success" : "neutral",
      icon: <UsersIcon />,
    },
    {
      label: t("attendance.kpi.totalHoursLabel"),
      value: summary.total_hours_label,
      description: t("attendance.kpi.totalHoursDesc"),
      trend: t("attendance.kpi.totalHoursTrend"),
      trendTone: "neutral",
      icon: <ClockIcon />,
    },
    {
      label: t("attendance.kpi.missingClockOutLabel"),
      value: String(summary.missing_clock_out_count),
      description: t("attendance.kpi.missingClockOutDesc"),
      trend:
        summary.missing_clock_out_count > 0
          ? t("attendance.kpi.missingClockOutTrendFollow")
          : t("attendance.kpi.missingClockOutTrendClear"),
      trendTone: summary.missing_clock_out_count > 0 ? "warning" : "success",
      icon: <AlertIcon />,
    },
    {
      label: t("attendance.kpi.gpsIssuesLabel"),
      value: String(summary.gps_issues_count),
      description: t("attendance.kpi.gpsIssuesDesc"),
      trend:
        summary.gps_issues_count > 0
          ? t("attendance.kpi.gpsIssuesTrendReview")
          : t("attendance.kpi.gpsIssuesTrendClear"),
      trendTone: summary.gps_issues_count > 0 ? "danger" : "success",
      icon: <MapIcon />,
    },
    {
      label: t("attendance.kpi.reviewRequiredLabel"),
      value: String(summary.review_required_count),
      description: t("attendance.kpi.reviewRequiredDesc"),
      trend:
        summary.review_required_count > 0
          ? t("attendance.kpi.reviewRequiredTrendPending")
          : t("attendance.kpi.reviewRequiredTrendClear"),
      trendTone: summary.review_required_count > 0 ? "warning" : "success",
      icon: <ReviewIcon />,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className={`${dashboardCard} flex flex-col rounded-2xl p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2563EB]/10 text-[#2563EB]">
              {c.icon}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TREND_CLASS[c.trendTone]}`}
            >
              {c.trend}
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold tracking-tight text-[#0F172A]">{c.value}</p>
          <p className="mt-1 text-sm font-semibold text-[#0F172A]">{c.label}</p>
          <p className="mt-0.5 text-xs font-normal text-[#64748B]">{c.description}</p>
        </div>
      ))}
    </div>
  );
}
