"use client";

import type { ReportSummary } from "@/lib/attendance-report";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { dashboardCard } from "./dashboard-ui";

type Activity = {
  id: string;
  staff: string;
  action: string;
  time: string;
  tone: "success" | "warning" | "neutral";
};

type Props = {
  summary: ReportSummary;
  activities?: Activity[];
};

const ACTIVITY_DOT: Record<Activity["tone"], string> = {
  success: "bg-[#22C55E]",
  warning: "bg-[#F59E0B]",
  neutral: "bg-[#64748B]",
};

function LineChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 320;
  const h = 120;
  const pad = 8;
  const points = values
    .map((value, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - (value / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="url(#lineFill)"
        stroke="none"
        points={`${points} ${w - pad},${h - pad} ${pad},${h - pad}`}
      />
      <polyline
        fill="none"
        stroke="#2563EB"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function DonutChart({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative mx-auto flex h-32 w-32 items-center justify-center sm:h-36 sm:w-36">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r / 2.2} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r / 2.2}
          fill="none"
          stroke="#2563EB"
          strokeWidth="10"
          strokeDasharray={c / 2.2}
          strokeDashoffset={offset / 2.2}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-[#0F172A] sm:text-2xl">{pct}%</span>
      </div>
    </div>
  );
}

export function DashboardChartsSection({ summary, activities }: Props) {
  const { t } = useI18n();

  const placeholderWeek = [
    { day: t("attendance.charts.weekdayMon"), value: 12 },
    { day: t("attendance.charts.weekdayTue"), value: 15 },
    { day: t("attendance.charts.weekdayWed"), value: 14 },
    { day: t("attendance.charts.weekdayThu"), value: 18 },
    { day: t("attendance.charts.weekdayFri"), value: 16 },
    { day: t("attendance.charts.weekdaySat"), value: 9 },
    { day: t("attendance.charts.weekdaySun"), value: 7 },
  ];

  const defaultActivities: Activity[] = [
    {
      id: "1",
      staff: t("attendance.charts.defaultStaffMember"),
      action: t("attendance.charts.defaultClockedIn"),
      time: t("attendance.charts.defaultJustNow"),
      tone: "success",
    },
    {
      id: "2",
      staff: t("attendance.charts.defaultStaffMember"),
      action: t("attendance.charts.defaultGpsVerified"),
      time: t("attendance.charts.defaultMinutesAgo"),
      tone: "neutral",
    },
    {
      id: "3",
      staff: t("attendance.charts.defaultStaffMember"),
      action: t("attendance.charts.defaultReviewRequired"),
      time: t("attendance.charts.defaultMinutesAgo12"),
      tone: "warning",
    },
  ];

  const list = activities && activities.length > 0 ? activities : defaultActivities;
  const totalStaff = Math.max(summary.total_present_staff + 5, summary.total_present_staff);
  const present = summary.total_present_staff;
  const attendanceRate = Math.min(100, Math.round((present / totalStaff) * 100));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className={`${dashboardCard} flex flex-col p-5`}>
        <h3 className="text-sm font-semibold text-[#0F172A]">{t("attendance.charts.overviewTitle")}</h3>
        <p className="mt-0.5 text-xs font-normal text-[#64748B]">{t("attendance.charts.overviewSubtitle")}</p>
        <div className="mt-4 h-32">
          <LineChart values={placeholderWeek.map((d) => d.value)} />
        </div>
        <div className="mt-3 flex justify-between text-[11px] font-medium text-[#64748B]">
          {placeholderWeek.map((d) => (
            <span key={d.day}>{d.day}</span>
          ))}
        </div>
      </section>

      <section className={`${dashboardCard} flex min-h-[280px] flex-col p-5`}>
        <h3 className="text-sm font-semibold text-[#0F172A]">{t("attendance.charts.presentStaffTitle")}</h3>

        <div className="mt-4">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-[#0F172A]">{present}</p>
          <p className="mt-0.5 text-xs font-normal text-[#64748B]">{t("attendance.charts.presentToday")}</p>
        </div>

        <div className="mt-5 flex flex-1 items-center justify-center py-2">
          <DonutChart pct={attendanceRate} />
        </div>

        <div className="mt-4 border-t border-[#E2E8F0] pt-4 text-center">
          <p className="text-xs font-medium text-[#64748B]">{t("attendance.charts.attendanceRate")}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#0F172A]">
            {attendanceRate}%
          </p>
        </div>
      </section>

      <section className={`${dashboardCard} flex flex-col p-5`}>
        <h3 className="text-sm font-semibold text-[#0F172A]">{t("attendance.charts.recentActivities")}</h3>
        <p className="mt-0.5 text-xs font-normal text-[#64748B]">{t("attendance.charts.latestPunchEvents")}</p>
        <ul className="mt-4 space-y-3">
          {list.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTIVITY_DOT[a.tone]}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#0F172A]">{a.staff}</p>
                <p className="text-xs text-[#64748B]">{a.action}</p>
              </div>
              <span className="shrink-0 text-[11px] text-[#64748B]">{a.time}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
