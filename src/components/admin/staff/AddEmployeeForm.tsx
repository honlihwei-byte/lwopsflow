"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  SCHEDULE_MODE_LABELS,
  type ScheduleMode,
  type ScheduleSlot,
} from "@/lib/staff-schedule";

type Shop = { id: string; name: string };

const WEEKDAY_KEYS = [
  "attendance.charts.weekdayMon",
  "attendance.charts.weekdayTue",
  "attendance.charts.weekdayWed",
  "attendance.charts.weekdayThu",
  "attendance.charts.weekdayFri",
  "attendance.charts.weekdaySat",
  "attendance.charts.weekdaySun",
] as const;

function emptySlot(dow: number): ScheduleSlot {
  return {
    day_of_week: dow,
    schedule_date: null,
    biweekly_week: null,
    start_time: "09:00",
    end_time: "18:00",
  };
}

export function AddEmployeeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [staffName, setStaffName] = useState("");
  const [phone, setPhone] = useState("");
  const [staffType, setStaffType] = useState<"full_time" | "part_time">("full_time");
  const [shopIds, setShopIds] = useState<Set<string>>(new Set());
  const [allowPunch, setAllowPunch] = useState(true);
  const [reportingManager, setReportingManager] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("fixed_daily");
  const [defaultStart, setDefaultStart] = useState("09:00");
  const [defaultEnd, setDefaultEnd] = useState("18:00");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

  const loadShops = useCallback(async () => {
    const res = await fetch("/api/shops", { credentials: "include" });
    const j = await res.json();
    if (res.ok) setShops(j.shops ?? []);
  }, []);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  function toggleShop(id: string) {
    setShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addWeeklySlot() {
    setSlots((s) => [...s, emptySlot(0)]);
  }

  function updateSlot(i: number, patch: Partial<ScheduleSlot>) {
    setSlots((arr) => arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeSlot(i: number) {
    setSlots((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffName.trim()) {
      setError(t("staff.employeeNameRequired"));
      return;
    }
    if (shopIds.size === 0) {
      setError(t("staff.assignOneShop"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staff_name: staffName.trim(),
          phone: phone.trim() || null,
          staff_type: staffType,
          shop_ids: [...shopIds],
          allow_punch: allowPunch,
          reporting_manager: reportingManager.trim() || null,
          schedule_mode: scheduleMode,
          default_start_time: defaultStart,
          default_end_time: defaultEnd,
          schedule_slots: scheduleMode === "fixed_daily" ? [] : slots,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to add employee");
      router.push("/admin/staff");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const sectionClass =
    "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 pb-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("staff.addEmployee")}</h1>
          <p className="text-sm text-zinc-600">{t("staff.addEmployeeSubtitle")}</p>
        </div>
        <Link href="/admin/staff" className="text-sm font-semibold underline">
          {t("staff.back")}
        </Link>
      </header>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <section className={sectionClass}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{t("staff.basicDetails")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            {t("staff.employeeName")}
            <input
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              className="rounded-xl border px-4 py-3 dark:bg-zinc-900"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("staff.phoneNumber")}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl border px-4 py-3 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("staff.staffType")}
            <select
              value={staffType}
              onChange={(e) => setStaffType(e.target.value as "full_time" | "part_time")}
              className="rounded-xl border px-4 py-3 dark:bg-zinc-900"
            >
              <option value="full_time">{t("attendance.fullTime")}</option>
              <option value="part_time">{t("attendance.partTime")}</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">{t("staff.assignedShop")}</legend>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {shops.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={shopIds.has(s.id)}
                      onChange={() => toggleShop(s.id)}
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{t("staff.workTiming")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("staff.defaultStart")}
            <input
              type="time"
              value={defaultStart}
              onChange={(e) => setDefaultStart(e.target.value)}
              className="rounded-xl border px-4 py-3 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("staff.defaultEnd")}
            <input
              type="time"
              value={defaultEnd}
              onChange={(e) => setDefaultEnd(e.target.value)}
              className="rounded-xl border px-4 py-3 dark:bg-zinc-900"
            />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{t("staff.scheduleMode")}</h2>
        <select
          value={scheduleMode}
          onChange={(e) => {
            setScheduleMode(e.target.value as ScheduleMode);
            if (e.target.value !== "fixed_daily" && slots.length === 0) {
              setSlots([emptySlot(0)]);
            }
          }}
          className="mt-4 w-full rounded-xl border px-4 py-3 text-sm dark:bg-zinc-900"
        >
          {(Object.keys(SCHEDULE_MODE_LABELS) as ScheduleMode[]).map((m) => (
            <option key={m} value={m}>
              {SCHEDULE_MODE_LABELS[m]}
            </option>
          ))}
        </select>

        {scheduleMode !== "fixed_daily" ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500">
              {staffType === "part_time" ? t("staff.partTimeScheduleHint") : t("staff.fullTimeScheduleHint")}
            </p>
            {slots.map((slot, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
              >
                {scheduleMode === "custom" || scheduleMode === "monthly" ? (
                  <label className="text-xs font-medium sm:col-span-2">
                    {t("staff.date")}
                    <input
                      type="date"
                      value={slot.schedule_date ?? ""}
                      onChange={(e) => updateSlot(i, { schedule_date: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-2 py-2 dark:bg-zinc-950"
                    />
                  </label>
                ) : (
                  <label className="text-xs font-medium">
                    {t("staff.day")}
                    <select
                      value={slot.day_of_week ?? 0}
                      onChange={(e) => updateSlot(i, { day_of_week: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border px-2 py-2 dark:bg-zinc-950"
                    >
                      {WEEKDAY_KEYS.map((key, di) => (
                        <option key={key} value={di}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {scheduleMode === "bi_weekly" ? (
                  <label className="text-xs font-medium">
                    {t("staff.week")}
                    <select
                      value={slot.biweekly_week ?? 1}
                      onChange={(e) => updateSlot(i, { biweekly_week: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border px-2 py-2 dark:bg-zinc-950"
                    >
                      <option value={1}>{t("staff.week1")}</option>
                      <option value={2}>{t("staff.week2")}</option>
                    </select>
                  </label>
                ) : null}
                <label className="text-xs font-medium">
                  {t("staff.start")}
                  <input
                    type="time"
                    value={slot.start_time}
                    onChange={(e) => updateSlot(i, { start_time: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-2 py-2 dark:bg-zinc-950"
                  />
                </label>
                <label className="text-xs font-medium">
                  {t("staff.end")}
                  <input
                    type="time"
                    value={slot.end_time}
                    onChange={(e) => updateSlot(i, { end_time: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-2 py-2 dark:bg-zinc-950"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="text-xs text-red-600 sm:col-span-2"
                >
                  {t("staff.removeSlot")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addWeeklySlot}
              className="text-sm font-semibold text-emerald-700"
            >
              {t("staff.addShiftSlot")}
            </button>
          </div>
        ) : null}
      </section>

      <section className={sectionClass}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{t("staff.punchPermission")}</h2>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={allowPunch}
            onChange={(e) => setAllowPunch(e.target.checked)}
            className="h-5 w-5 rounded"
          />
          {t("staff.allowPunch")}
        </label>
      </section>

      <section className={sectionClass}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">
          {t("staff.reportingManager")}
        </h2>
        <input
          value={reportingManager}
          onChange={(e) => setReportingManager(e.target.value)}
          placeholder={t("staff.managerNamePlaceholder")}
          className="mt-4 w-full rounded-xl border px-4 py-3 dark:bg-zinc-900"
        />
      </section>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-zinc-900 py-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {saving ? t("staff.saving") : t("staff.saveEmployee")}
      </button>
    </form>
  );
}
