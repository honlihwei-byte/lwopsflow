"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { displayShiftStatus } from "@/lib/i18n/display-values";

type Shop = { id: string; name: string };
type Staff = { id: string; staff_name: string; staff_code: string; staff_type?: string };

type ScheduleRow = {
  id: string;
  shop_id: string;
  staff_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: "active" | "cancelled";
};

function mondayOfWeek(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function ShiftScheduleManager({ shops, staff }: { shops: Shop[]; staff: Staff[] }) {
  const { t } = useI18n();
  const today = malaysiaDateYmd(new Date());
  const [shopId, setShopId] = useState("__all__");
  const [staffId, setStaffId] = useState("__all__");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parseApiError(res: Response): Promise<string> {
    try {
      const j = (await res.json()) as { error?: string; details?: string; hint?: string; code?: string };
      const parts = [
        j.error || `Request failed`,
        j.code ? `(${j.code})` : null,
        j.details ? `— ${j.details}` : null,
        j.hint ? `— ${j.hint}` : null,
      ].filter(Boolean);
      return `${res.status} ${res.statusText}: ${parts.join(" ")}`;
    } catch {
      try {
        const t = (await res.text())?.trim();
        if (t) return `${res.status} ${res.statusText}: ${t.slice(0, 240)}`;
      } catch {
        // ignore
      }
      return `${res.status} ${res.statusText}`;
    }
  }

  // create form
  const [shiftDate, setShiftDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [repeatType, setRepeatType] = useState<"one_day" | "weekly" | "bi_weekly" | "monthly">("one_day");
  const [bulkStaffIds, setBulkStaffIds] = useState<string[]>([]);

  const staffLabel = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, `${s.staff_name} (${s.staff_code})`]));
    return map;
  }, [staff]);
  const shopLabel = useMemo(() => new Map(shops.map((s) => [s.id, s.name])), [shops]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (shopId !== "__all__") qs.set("shop_id", shopId);
      if (staffId !== "__all__") qs.set("staff_id", staffId);
      const res = await fetch(`/api/admin/shift-schedule?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const j = (await res.json()) as { rows?: ScheduleRow[]; error?: string };
      setRows(j.rows ?? []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [from, to, shopId, staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSingle() {
    setLoading(true);
    setError(null);
    try {
      if (shopId === "__all__") throw new Error(t("schedule.selectShopFirst"));
      if (staffId === "__all__") throw new Error(t("schedule.selectStaffFirst"));
      const res = await fetch("/api/admin/shift-schedule", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          staff_id: staffId,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          break_minutes: breakMinutes,
          repeat_type: repeatType,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  async function bulkAssign() {
    setLoading(true);
    setError(null);
    try {
      if (shopId === "__all__") throw new Error(t("schedule.selectShopFirst"));
      if (bulkStaffIds.length === 0) throw new Error(t("schedule.selectStaffBulk"));
      const res = await fetch("/api/admin/shift-schedule/bulk-assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          staff_ids: bulkStaffIds,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          break_minutes: breakMinutes,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyPreviousWeek() {
    setLoading(true);
    setError(null);
    try {
      const weekStart = mondayOfWeek(shiftDate);
      const res = await fetch("/api/admin/shift-schedule/copy-week", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: weekStart,
          shop_id: shopId !== "__all__" ? shopId : undefined,
          staff_id: staffId !== "__all__" ? staffId : undefined,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm(t("schedule.confirmCancel"))) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shift-schedule/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("schedule.assignShift")}</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.shop")}
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
            >
              <option value="__all__">{t("schedule.selectShop")}</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.staffSingle")}
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="__all__">{t("schedule.selectStaff")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staff_name} ({s.staff_code})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.date")}
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.breakMinutes")}
            <input
              type="number"
              min={0}
              max={600}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.startTime")}
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.endTime")}
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.repeat")}
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as typeof repeatType)}
            >
              <option value="one_day">{t("schedule.oneDay")}</option>
              <option value="weekly">{t("schedule.weekly")}</option>
              <option value="bi_weekly">{t("schedule.biWeekly")}</option>
              <option value="monthly">{t("schedule.monthly")}</option>
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void createSingle()}
              disabled={loading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {t("schedule.assignShiftBtn")}
            </button>
            <button
              type="button"
              onClick={() => void copyPreviousWeek()}
              disabled={loading}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-zinc-600"
            >
              {t("schedule.copyPreviousWeek")}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{t("schedule.bulkAssign")}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("schedule.bulkAssignDesc")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              multiple
              value={bulkStaffIds}
              onChange={(e) => {
                const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                setBulkStaffIds(ids);
              }}
              className="h-32 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staff_name} ({s.staff_code})
                </option>
              ))}
            </select>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void bulkAssign()}
                disabled={loading}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("schedule.bulkAssignBtn")}
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("schedule.scheduleList")}</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.from")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("schedule.to")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-zinc-600"
          >
            {t("button.refresh")}
          </button>
        </div>

        {loading ? <p className="mt-3 text-sm text-zinc-500">{t("common.loading")}</p> : null}
        {rows.length === 0 && !loading ? (
          <p className="mt-3 text-sm text-zinc-500">{t("schedule.noShifts")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">{t("schedule.tableDate")}</th>
                  <th className="py-2 pr-3">{t("schedule.tableShop")}</th>
                  <th className="py-2 pr-3">{t("schedule.tableStaff")}</th>
                  <th className="py-2 pr-3">{t("schedule.tableShift")}</th>
                  <th className="py-2 pr-3">{t("schedule.tableBreak")}</th>
                  <th className="py-2 pr-3">{t("schedule.tableStatus")}</th>
                  <th className="py-2">{t("schedule.tableAction")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 font-mono text-xs">{r.shift_date}</td>
                    <td className="py-2 pr-3">{shopLabel.get(r.shop_id) ?? "—"}</td>
                    <td className="py-2 pr-3">{staffLabel.get(r.staff_id) ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.start_time}–{r.end_time}
                    </td>
                    <td className="py-2 pr-3">{r.break_minutes}m</td>
                    <td className="py-2 pr-3">{displayShiftStatus(t, r.status)}</td>
                    <td className="py-2">
                      {r.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void cancel(r.id)}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-200"
                        >
                          {t("schedule.cancel")}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

