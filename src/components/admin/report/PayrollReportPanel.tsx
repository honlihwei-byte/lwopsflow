"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { displayPayrollMode } from "@/lib/i18n/display-values";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { PayrollMode } from "@/lib/payroll-mode";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string };

type PayrollRow = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  position_name?: string | null;
  working_days: number;
  scheduled_hours_label: string;
  actual_hours_label: string;
  break_hours_label: string;
  payroll_hours_label: string;
  late_count: number;
  absent_count: number;
};

function monthStartYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function PayrollReportPanel() {
  const { t } = useI18n();
  const [shops, setShops] = useState<Shop[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(malaysiaDateYmd(new Date()));
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [payrollMode, setPayrollMode] = useState<PayrollMode>("scheduled_hours");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [shopRes, staffRes] = await Promise.all([
        fetch("/api/shops", { credentials: "include" }),
        fetch("/api/staff", { credentials: "include" }),
      ]);
      const shopJson = await shopRes.json();
      const staffJson = await staffRes.json();
      if (shopRes.ok) setShops((shopJson.shops ?? []) as Shop[]);
      if (staffRes.ok) setStaff((staffJson.staff ?? []) as Staff[]);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (shopId !== "__all__") params.set("shop_id", shopId);
      if (staffId !== "__all__") params.set("staff_id", staffId);
      const res = await fetch(`/api/admin/payroll-report?${params}`, { credentials: "include" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || t("payrollReport.failedLoad"));
      setRows(j.rows ?? []);
      if (j.payroll_mode) setPayrollMode(j.payroll_mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("payrollReport.failedLoad"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, shopId, staffId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    const header = [
      t("payrollReport.employee"),
      t("payrollReport.code"),
      t("positions.positionLabel"),
      t("payrollReport.workingDays"),
      t("payrollReport.scheduledHours"),
      t("payrollReport.actualHours"),
      t("payrollReport.breakHours"),
      t("payrollReport.payrollHours"),
      t("payrollReport.lateCount"),
      t("payrollReport.absentCount"),
    ];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          csvEscape(r.employee_name),
          csvEscape(r.employee_code),
          csvEscape(r.position_name ?? ""),
          r.working_days,
          csvEscape(r.scheduled_hours_label),
          csvEscape(r.actual_hours_label),
          csvEscape(r.break_hours_label),
          csvEscape(r.payroll_hours_label),
          r.late_count,
          r.absent_count,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("payrollReport.intro")}{" "}
        <strong>{displayPayrollMode(t, payrollMode)}</strong>. {t("payrollReport.introChange")}
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {t("payrollReport.from")}
          <input
            type="date"
            className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {t("payrollReport.to")}
          <input
            type="date"
            className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {t("payrollReport.shop")}
          <select
            className="min-w-[140px] rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
          >
            <option value="__all__">{t("payrollReport.allShops")}</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {t("payrollReport.staff")}
          <select
            className="min-w-[160px] rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="__all__">{t("payrollReport.allStaff")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.staff_name} ({s.staff_code})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? t("payrollReport.loading") : t("payrollReport.apply")}
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
        >
          {t("payrollReport.exportCsv")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">{t("payrollReport.employee")}</th>
              <th className="px-3 py-3">{t("payrollReport.workingDays")}</th>
              <th className="px-3 py-3">{t("payrollReport.scheduledHours")}</th>
              <th className="px-3 py-3">{t("payrollReport.actualHours")}</th>
              <th className="px-3 py-3">{t("payrollReport.breakHours")}</th>
              <th className="px-3 py-3">{t("payrollReport.payrollHours")}</th>
              <th className="px-3 py-3">{t("payrollReport.late")}</th>
              <th className="px-3 py-3">{t("payrollReport.absent")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  {t("payrollReport.noRows")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.employee_name}</p>
                    <p className="text-xs text-zinc-500">{r.employee_code}</p>
                    {r.position_name ? (
                      <p className="text-xs text-zinc-500">{r.position_name}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{r.working_days}</td>
                  <td className="px-3 py-3 tabular-nums">{r.scheduled_hours_label}</td>
                  <td className="px-3 py-3 tabular-nums">{r.actual_hours_label}</td>
                  <td className="px-3 py-3 tabular-nums">{r.break_hours_label}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{r.payroll_hours_label}</td>
                  <td className="px-3 py-3 tabular-nums">{r.late_count}</td>
                  <td className="px-3 py-3 tabular-nums">{r.absent_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
