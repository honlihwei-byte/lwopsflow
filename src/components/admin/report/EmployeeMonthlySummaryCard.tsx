"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { displayPayrollMode } from "@/lib/i18n/display-values";
import { kpiCountsFromDaily } from "@/lib/attendance-kpi";
import { formatDuration } from "@/lib/attendance";
import type { PayrollMode } from "@/lib/payroll-mode";
import type { DayShiftComparison, ShiftAttendanceStatus } from "@/lib/shift-attendance-report";
import type { MonthShiftPerformanceUi } from "./month-report-ui";

type Props = {
  shiftPerformance: MonthShiftPerformanceUi;
};

function dailyFromUi(perf: MonthShiftPerformanceUi): DayShiftComparison[] {
  return (perf.daily ?? []).map((d) => ({
    date: d.date,
    scheduled_start: d.scheduled_start,
    scheduled_end: d.scheduled_end,
    actual_clock_in: d.actual_clock_in,
    actual_clock_out: d.actual_clock_out,
    late_minutes: d.late_minutes,
    early_leave_minutes: d.early_leave_minutes,
    scheduled_hours_ms: 0,
    actual_hours_ms: 0,
    break_ms: 0,
    status: d.status as ShiftAttendanceStatus,
  }));
}

export function EmployeeMonthlySummaryCard({ shiftPerformance }: Props) {
  const { t } = useI18n();
  const [payrollMode, setPayrollMode] = useState<PayrollMode>("scheduled_hours");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/company/payroll-settings", { credentials: "include" });
        const j = (await res.json()) as { payroll_mode?: PayrollMode };
        if (res.ok && j.payroll_mode) setPayrollMode(j.payroll_mode);
      } catch {
        /* default */
      }
    })();
  }, []);

  const counts = useMemo(
    () => kpiCountsFromDaily(dailyFromUi(shiftPerformance)),
    [shiftPerformance],
  );

  const payrollMs =
    payrollMode === "actual_hours"
      ? shiftPerformance.actual_hours_ms
      : shiftPerformance.scheduled_hours_ms;

  const items = [
    { label: t("employeeSummary.actualHours"), value: shiftPerformance.actual_hours_label },
    { label: t("employeeSummary.payrollHours"), value: formatDuration(payrollMs) },
    { label: t("employeeSummary.workingDays"), value: String(counts.working_days) },
    { label: t("employeeSummary.earlyArrivals"), value: String(counts.early_arrival_count) },
    { label: t("employeeSummary.lateArrivals"), value: String(counts.late_arrival_count) },
    { label: t("employeeSummary.lateClockOuts"), value: String(counts.late_clock_out_count) },
    { label: t("employeeSummary.absentDays"), value: String(counts.absent_days) },
  ];

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("employeeSummary.title")}
      </h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] text-zinc-500">{item.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">
        {t("payroll.kpiNote")} {displayPayrollMode(t, payrollMode)}.
      </p>
    </div>
  );
}
