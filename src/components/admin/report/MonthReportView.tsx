"use client";

import { Fragment, useMemo, useState } from "react";
import type { ReportSummary } from "@/lib/attendance-report";
import { IssueBadges } from "./IssueBadges";
import { PunchLogTable } from "./PunchLogTable";
import {
  attendanceReliability,
  averageHoursPerDayLabel,
  buildMonthDashboardSummary,
  managerIssueChips,
  monthFirstInLastOut,
  monthManualEdits,
  monthPhotoProofRows,
  collectDeviceMismatchEvents,
  collectNewDeviceEvents,
  monthWorkingSessionsByDay,
  rowAttention,
  staffMonthStatus,
  type MonthRowUi,
  type MonthStaffStatus,
} from "./month-report-ui";
import { EmployeeMonthlySummaryCard } from "./EmployeeMonthlySummaryCard";
import { StaffTrustedDevicesPanel } from "./StaffTrustedDevicesPanel";
import { matchesEventDate, recordEventTime } from "@/lib/attendance-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  labelStaffName,
  translateManagerIssueChip,
  translateMonthStaffStatus,
  translateReliabilityTier,
  translateShiftPerformanceStatus,
  type ReliabilityTier,
} from "@/lib/i18n/attendance-ui";

function formatMonthTitle(monthYmd: string) {
  const [y, m] = monthYmd.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function MonthSummaryCards({ summary }: { summary: ReturnType<typeof buildMonthDashboardSummary> }) {
  const { t } = useI18n();
  const cards = [
    { label: t("attendance.month.presentStaff"), value: String(summary.presentStaff), tone: "emerald" as const },
    { label: t("attendance.month.totalHours"), value: summary.totalHoursLabel, tone: "blue" as const },
    { label: t("attendance.month.missingPunch"), value: String(summary.missingPunchCount), tone: "amber" as const },
    { label: t("attendance.month.gpsIssues"), value: String(summary.gpsIssuesCount), tone: "orange" as const },
    { label: t("attendance.month.reviewRequired"), value: String(summary.reviewRequiredCount), tone: "orange" as const },
    {
      label: t("attendance.month.attendanceRate"),
      value: `${summary.attendanceRatePercent}%`,
      tone: "blue" as const,
    },
  ];

  const toneClass = {
    emerald: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/50 dark:to-zinc-950",
    blue: "border-blue-200/80 bg-gradient-to-br from-blue-50 to-white shadow-sm dark:border-blue-900/60 dark:from-blue-950/50 dark:to-zinc-950",
    amber: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:to-zinc-950",
    orange: "border-orange-200/80 bg-gradient-to-br from-orange-50 to-white shadow-sm dark:border-orange-900/60 dark:from-orange-950/40 dark:to-zinc-950",
    rose: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-white shadow-sm dark:border-rose-900/60 dark:from-rose-950/40 dark:to-zinc-950",
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl border px-4 py-3 ${toneClass[c.tone]}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-xs">
            {c.label}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

type DrillItem = {
  date: string;
  staff_name: string;
  shop_name: string;
  type: string;
  device_name?: string;
  fingerprint?: string;
  scheduled?: string | null;
  first_in?: string | null;
  last_out?: string | null;
  minutes?: number | null;
  punches?: any[];
  staff_id?: string;
};

function OverlayModal({
  open,
  title,
  items,
  onClose,
  onOpenDetails,
}: {
  open: boolean;
  title: string;
  items: DrillItem[];
  onClose: () => void;
  onOpenDetails: (staffId: string) => void;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-900"
          >
            {t("attendance.buttons.close")}
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("attendance.drill.empty")}</p>
          ) : (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={`${it.date}-${idx}`} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {it.date} · {it.staff_name}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {it.shop_name} · {it.type}
                        {it.minutes != null ? ` · ${it.minutes} min` : ""}
                      </p>
                      {it.device_name || it.fingerprint ? (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {t("attendance.drill.device")}: {it.device_name ?? "—"}
                          {it.fingerprint
                            ? ` · ${t("attendance.drill.fingerprint")} ${it.fingerprint}`
                            : ""}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {it.scheduled ? `${t("attendance.drill.scheduled")} ${it.scheduled} · ` : ""}
                        {t("attendance.drill.firstIn")} {it.first_in ?? "—"} · {t("attendance.drill.lastOut")}{" "}
                        {it.last_out ?? "—"}
                      </p>
                    </div>
                    {/* We can only open the main details panel (punch log lives there) */}
                    <button
                      type="button"
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                      onClick={() => onOpenDetails((it as any).staff_id)}
                    >
                      {t("attendance.buttons.punchLog")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<MonthStaffStatus, { dot: string; className: string }> = {
  in_shop: {
    dot: "🟢",
    className:
      "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/80 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-800",
  },
  out: {
    dot: "⚪",
    className:
      "bg-zinc-100 text-zinc-800 ring-1 ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600",
  },
  absent: {
    dot: "🔴",
    className:
      "bg-red-100 text-red-900 ring-1 ring-red-300/80 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900",
  },
  review_needed: {
    dot: "🟡",
    className:
      "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800",
  },
};

function MonthStatusBadge({ status }: { status: MonthStaffStatus }) {
  const { t } = useI18n();
  const c = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.className}`}
    >
      <span aria-hidden>{c.dot}</span>
      {translateMonthStaffStatus(t, status)}
    </span>
  );
}

function ManagerIssueChips({
  row,
  onChipClick,
}: {
  row: MonthRowUi;
  onChipClick?: (key: string) => void;
}) {
  const { t } = useI18n();
  const chips = managerIssueChips(row.issues, row);
  if (chips.length === 0) {
    return <span className="text-xs text-zinc-400">{t("attendance.managerOverview.none")}</span>;
  }
  const toneClass: Record<(typeof chips)[0]["tone"], string> = {
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
    violet: "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100",
    teal: "bg-teal-100 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100",
    orange: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100",
    red: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100",
    rose: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100",
    sky: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
  };
  return (
    <div className="flex max-w-[200px] flex-wrap gap-1">
      {chips.slice(0, 4).map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChipClick?.(chip.key)}
          className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${
            toneClass[chip.tone]
          } ${onChipClick ? "cursor-pointer hover:opacity-90" : ""}`}
        >
          {translateManagerIssueChip(t, chip.key)}
        </button>
      ))}
      {chips.length > 4 ? (
        <span className="text-[10px] text-zinc-500">+{chips.length - 4}</span>
      ) : null}
    </div>
  );
}

const ROW_BORDER: Record<ReturnType<typeof rowAttention>, string> = {
  normal: "border-l-emerald-500",
  attention: "border-l-amber-500",
  critical: "border-l-red-500",
};

function reliabilityToneClass(tier: ReliabilityTier): string {
  if (tier === "excellent") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100";
  }
  if (tier === "good") {
    return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
  }
  if (tier === "fair") {
    return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
  }
  return "bg-rose-200 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100";
}

function MonthStaffDetail({
  row,
  month,
  daysInMonth,
}: {
  row: MonthRowUi;
  month: string;
  daysInMonth: number;
}) {
  const { t } = useI18n();
  const { firstIn, lastOut } = monthFirstInLastOut(row.history);
  const rel = attendanceReliability(row);
  const daySessions = monthWorkingSessionsByDay(row.history, month, daysInMonth);
  const manual = monthManualEdits(row.history);
  const photoProof = monthPhotoProofRows(row.history);

  return (
    <div className="space-y-5 border-t border-zinc-200/80 bg-zinc-50/80 px-4 py-5 dark:border-zinc-800 dark:bg-zinc-900/60">
      {row.shift_performance ? (
        <EmployeeMonthlySummaryCard shiftPerformance={row.shift_performance} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("attendance.detailPanel.firstInMonth")}
          </p>
          <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{firstIn ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("attendance.detailPanel.lastOutMonth")}
          </p>
          <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{lastOut ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("attendance.detailPanel.gpsDetail")}
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {t("attendance.detailPanel.gpsWeak")} {row.weak_gps_count} · {t("attendance.detailPanel.gpsRejected")}{" "}
            {row.rejected_gps_count} · {t("attendance.detailPanel.gpsReview")} {row.review_required_count}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("attendance.detailPanel.scoreDetail")}
          </p>
          <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{row.summary_score}</p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("attendance.detailPanel.workingSessions")}
        </h4>
        {daySessions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">{t("attendance.detailPanel.noSessions")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {daySessions.map((d) => (
              <li
                key={d.date}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{d.date}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">{d.hoursLabel}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {d.firstIn ?? "—"} → {d.lastOut ?? "—"}
                </p>
                {d.sessions.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {d.sessions.map((s, i) => (
                      <li key={`${d.date}-${i}`}>
                        {t("attendance.detailPanel.session")} {i + 1}: {s.in} – {s.out} ({s.durationLabel})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {manual.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("attendance.detailPanel.manualEdits")}
          </h4>
          <PunchLogTable rows={manual} showDate />
        </div>
      ) : null}

      {photoProof.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("attendance.detailPanel.photoProof")}
          </h4>
          <PunchLogTable rows={photoProof} showDate />
        </div>
      ) : null}

      {row.shift_performance ? (
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("attendance.detailPanel.scheduleVsActual")}
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="text-zinc-500">{t("attendance.detailPanel.scheduledDays")}</dt>
              <dd className="font-semibold">{row.shift_performance.scheduled_days}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("attendance.detailPanel.attendedDays")}</dt>
              <dd>{row.shift_performance.present_days}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("attendance.detailPanel.missedShifts")}</dt>
              <dd>{row.shift_performance.absent_count}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("attendance.detailPanel.lateCount")}</dt>
              <dd>{row.shift_performance.late_count}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-zinc-500">
                {t("attendance.detailPanel.attendanceReliability")}
                <span title={t("attendance.reliability.tooltip")} className="cursor-help text-zinc-400">
                  ⓘ
                </span>
              </dt>
              <dd className="font-semibold">
                {translateReliabilityTier(t, rel.tier)} · {rel.score}%
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("attendance.detailPanel.scheduledActualHrs")}</dt>
              <dd>
                {row.shift_performance.scheduled_hours_label} / {row.shift_performance.actual_hours_label}
              </dd>
            </div>
          </dl>
          {row.shift_performance.daily && row.shift_performance.daily.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-1 pr-2">{t("attendance.detailPanel.date")}</th>
                    <th className="py-1 pr-2">{t("attendance.table.schedShort")}</th>
                    <th className="py-1 pr-2">{t("attendance.table.shiftsShort")}</th>
                    <th className="py-1 pr-2">{t("attendance.table.inShort")}</th>
                    <th className="py-1 pr-2">{t("attendance.table.outShort")}</th>
                    <th className="py-1 pr-2">{t("attendance.table.lateShort")}</th>
                    <th className="py-1">{t("attendance.table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.shift_performance.daily
                    .filter((d) => d.status !== "not_scheduled")
                    .slice(0, 31)
                    .flatMap((d) => {
                      const shiftRows =
                        d.per_shift && d.per_shift.length > 1
                          ? d.per_shift.map((ps, idx) => ({
                              key: `${d.date}-${idx}`,
                              date: d.date,
                              sched: `${ps.scheduled_start}–${ps.scheduled_end}`,
                              shifts: "—",
                              in: ps.actual_clock_in?.slice(11, 16) ?? "—",
                              out: ps.actual_clock_out?.slice(11, 16) ?? "—",
                              late: ps.late_minutes > 0 ? `${ps.late_minutes}m` : "—",
                              status: ps.status,
                            }))
                          : [
                              {
                                key: d.date,
                                date: d.date,
                                sched: d.scheduled_label
                                  ? d.scheduled_label.includes(" + ")
                                    ? d.scheduled_label.split(" + ").join("\n")
                                    : d.scheduled_label
                                  : d.scheduled_start && d.scheduled_end
                                    ? `${d.scheduled_start}–${d.scheduled_end}`
                                    : "—",
                                shifts:
                                  (d.shifts_today ?? 0) > 0
                                    ? String(d.shifts_today)
                                    : "—",
                                in: d.actual_clock_in?.slice(11, 16) ?? "—",
                                out: d.actual_clock_out?.slice(11, 16) ?? "—",
                                late: d.late_minutes > 0 ? `${d.late_minutes}m` : "—",
                                status: d.status,
                                shiftMeta:
                                  (d.shifts_today ?? 0) > 1
                                    ? `${d.attended_shifts ?? 0}/${d.shifts_today} ${t("attendance.table.attendedShiftsShort").toLowerCase()}${(d.missed_shifts ?? 0) > 0 ? ` · ${d.missed_shifts} ${t("attendance.table.missedShiftsShort").toLowerCase()}` : ""}`
                                    : null,
                              },
                            ];
                      return shiftRows.map((row) => (
                        <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="py-1 pr-2">{row.date}</td>
                          <td className="py-1 pr-2 whitespace-pre-line">{row.sched}</td>
                          <td className="py-1 pr-2 tabular-nums">
                            {row.shifts}
                            {"shiftMeta" in row && row.shiftMeta ? (
                              <span className="block text-[10px] text-zinc-400">{row.shiftMeta}</span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-2">{row.in}</td>
                          <td className="py-1 pr-2">{row.out}</td>
                          <td className="py-1 pr-2">{row.late}</td>
                          <td className="py-1">{translateShiftPerformanceStatus(t, row.status)}</td>
                        </tr>
                      ));
                    })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("attendance.detailPanel.allIssueFlags")}
        </h4>
        <IssueBadges issues={row.issues} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("attendance.detailPanel.trustedDevices")}
        </h4>
        <StaffTrustedDevicesPanel staffId={row.staff_id} />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("attendance.detailPanel.attendanceHistory")}
        </h4>
        <PunchLogTable rows={row.history} showDate />
      </div>
    </div>
  );
}

export function MonthReportView({
  month,
  daysInMonth,
  rows,
  summary,
  reportView,
  expanded,
  setExpanded,
  onOpenIssueDetail,
}: {
  month: string;
  daysInMonth: number;
  rows: MonthRowUi[];
  summary: ReportSummary;
  reportView: "attendance" | "absent";
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  onOpenIssueDetail?: (d: {
    title: string;
    severity: "Info" | "Warning" | "High Risk";
    what: string;
    why: string[];
    recommended: string[];
    date: string;
    shop: string;
    scheduled: string | null;
    punches: any[];
    action_required: boolean;
  }) => void;
}) {
  const { t } = useI18n();
  const dashboard = useMemo(
    () => buildMonthDashboardSummary(month, rows, summary.total_hours_label),
    [month, rows, summary.total_hours_label],
  );
  const [drill, setDrill] = useState<{ title: string; items: DrillItem[] } | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40">
        {t("attendance.month.noDataMonth")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {t("attendance.managerOverview.title")}
          </p>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{formatMonthTitle(month)}</h3>
        </div>
        <p className="text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("attendance.managerOverview.legendNormal")}
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" />{" "}
            {t("attendance.managerOverview.legendAttention")}
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> {t("attendance.managerOverview.legendCritical")}
          </span>
        </p>
      </div>

      <MonthSummaryCards summary={dashboard} />

      <div className="overflow-hidden rounded-2xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100/90 text-xs uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <th className="px-4 py-3 font-semibold">{t("attendance.managerTable.staff")}</th>
                <th className="px-3 py-3 font-semibold text-center">{t("attendance.managerTable.present")}</th>
                <th className="px-3 py-3 font-semibold">{t("attendance.managerTable.totalHours")}</th>
                <th className="px-3 py-3 font-semibold">{t("attendance.managerTable.avgPerDay")}</th>
                <th className="px-3 py-3 font-semibold text-center">{t("attendance.managerTable.missingPunch")}</th>
                <th className="px-3 py-3 font-semibold">{t("attendance.managerTable.status")}</th>
                <th className="px-3 py-3 font-semibold">{t("attendance.managerTable.issues")}</th>
                <th className="px-3 py-3 font-semibold text-center">{t("attendance.managerTable.reliability")}</th>
                <th className="px-3 py-3 font-semibold text-center">{t("attendance.managerTable.late")}</th>
                <th className="px-3 py-3 font-semibold text-right">{t("attendance.managerTable.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const attention = rowAttention(r, month);
                const todayYmd = malaysiaDateYmd(new Date());
                const todayDaily = r.shift_performance?.daily?.find((d) => d.date === todayYmd);
                const status = staffMonthStatus(r.history, month, todayDaily?.status);
                const isOpen = expanded === r.staff_id;
                const rel = attendanceReliability(r);
                return (
                  <Fragment key={r.staff_id}>
                    <tr
                      className={`border-l-4 ${ROW_BORDER[attention]} odd:bg-white even:bg-zinc-50/80 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40`}
                    >
                      <td className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {labelStaffName(t, r.staff_name, r.staff_status)}
                        </p>
                        <p className="text-xs text-zinc-500">{r.staff_code}</p>
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-center tabular-nums dark:border-zinc-800">
                        {r.present_days}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 font-semibold tabular-nums dark:border-zinc-800">
                        {r.total_hours_label}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 tabular-nums text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                        {averageHoursPerDayLabel(r)}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-center dark:border-zinc-800">
                        {(() => {
                          const daily = r.shift_performance?.daily ?? [];
                          const missingDays = daily.filter(
                            (d) =>
                              d.status === "missing_clock_out" || d.status === "missing_clock_in",
                          );
                          // open_shift / in_shift / waiting / completed are not missing punch
                          const count = missingDays.length;
                          return (
                            <button
                              type="button"
                              className={`inline-flex min-w-[1.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                count > 0
                                  ? "bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
                              }`}
                              onClick={() => {
                                const items: DrillItem[] = [];
                                for (const d of missingDays) {
                                  const dayRows = r.history.filter((p) => matchesEventDate(p, d.date));
                                  const shop_name = dayRows[0]?.shop_name ?? "—";
                                  items.push({
                                    ...({ staff_id: r.staff_id } as any),
                                    date: d.date,
                                    staff_name: r.staff_name,
                                    shop_name,
                                    type:
                                      d.status === "missing_clock_out"
                                        ? t("attendance.drill.missingClockOut")
                                        : t("attendance.drill.missingClockIn"),
                                    scheduled:
                                      d.scheduled_start && d.scheduled_end
                                        ? `${d.scheduled_start}–${d.scheduled_end}`
                                        : null,
                                    first_in: d.actual_clock_in,
                                    last_out: d.actual_clock_out,
                                  });
                                }
                                setDrill({ title: t("attendance.drill.missingPunch"), items });
                              }}
                            >
                              {count}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
                        <MonthStatusBadge status={status} />
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
                        <ManagerIssueChips
                          row={r}
                          onChipClick={(key) => {
                            if (key === "new_device") {
                              const events = collectNewDeviceEvents(r);
                              setDrill({
                                title: t("attendance.drill.newDevice"),
                                items: events.map((e) => ({
                                  date: e.date,
                                  staff_name: e.staff_name,
                                  shop_name: e.shop_name,
                                  type: e.type,
                                  device_name: e.device_name,
                                  fingerprint: e.fingerprint,
                                })),
                              });
                              return;
                            }
                            if (key === "device_mismatch") {
                              const events = collectDeviceMismatchEvents(r);
                              setDrill({
                                title: t("attendance.drill.deviceMismatch"),
                                items: events.map((e) => ({
                                  date: e.date,
                                  staff_name: e.staff_name,
                                  shop_name: e.shop_name,
                                  type: e.type,
                                  device_name: e.device_name,
                                  fingerprint: e.fingerprint,
                                })),
                              });
                            }
                          }}
                        />
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-center tabular-nums dark:border-zinc-800">
                        {r.shift_performance ? (
                          <span
                            className={`inline-flex flex-col items-center justify-center rounded-xl px-2 py-1 text-xs font-semibold ${reliabilityToneClass(rel.tier)}`}
                            title={t("attendance.reliability.tooltip")}
                          >
                            <span>{translateReliabilityTier(t, rel.tier)}</span>
                            <span className="tabular-nums">{rel.score}%</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-center tabular-nums dark:border-zinc-800">
                        {r.shift_performance?.late_count != null ? (
                          <button
                            type="button"
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            onClick={() => {
                              const items: DrillItem[] = [];
                              for (const d of r.shift_performance?.daily ?? []) {
                                if (d.status !== "late") continue;
                                const dayRows = r.history.filter((p) => matchesEventDate(p, d.date));
                                const shop_name = dayRows[0]?.shop_name ?? "—";
                                items.push({
                                  ...( { staff_id: r.staff_id } as any ),
                                  date: d.date,
                                  staff_name: r.staff_name,
                                  shop_name,
                                  type: t("attendance.drill.late"),
                                  minutes: d.late_minutes,
                                  scheduled: d.scheduled_start
                                    ? `${t("attendance.drill.start")} ${d.scheduled_start}`
                                    : null,
                                  first_in: d.actual_clock_in,
                                  last_out: d.actual_clock_out,
                                });
                              }
                              setDrill({ title: t("attendance.drill.lateRecords"), items });
                            }}
                          >
                            {r.shift_performance.late_count}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-right dark:border-zinc-800">
                        {reportView === "attendance" ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : r.staff_id)}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                          >
                            {isOpen ? t("attendance.buttons.close") : t("attendance.buttons.details")}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {reportView === "attendance" && isOpen ? (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <MonthStaffDetail row={r} month={month} daysInMonth={daysInMonth} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {t("attendance.managerOverview.footerHint")}
      </p>

      <OverlayModal
        open={drill != null}
        title={drill?.title ?? ""}
        items={drill?.items ?? []}
        onClose={() => setDrill(null)}
        onOpenDetails={(staffId) => {
          setExpanded(staffId);
          setDrill(null);
        }}
      />
    </div>
  );
}
