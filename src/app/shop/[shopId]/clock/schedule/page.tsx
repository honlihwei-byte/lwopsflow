"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateEmployeeStatus } from "@/lib/i18n/employee-translate";
import type { Locale } from "@/lib/i18n";

type DayCard = {
  date: string;
  status: "today" | "upcoming" | "completed" | "off_day";
  shifts: Array<{
    shop_id: string;
    shop_name: string | null;
    template_name: string | null;
    start_time: string;
    end_time: string;
    break_minutes: number;
  }>;
};

function localeTag(locale: Locale): string {
  if (locale === "zh") return "zh-MY";
  if (locale === "ms") return "ms-MY";
  return "en-MY";
}

function weekdayLabel(ymd: string, locale: Locale): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString(localeTag(locale), { weekday: "long" });
}

function dateLabel(ymd: string, locale: Locale): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString(localeTag(locale), { day: "numeric", month: "short" });
}

function tone(status: DayCard["status"]): { bg: string; text: string; chip: string } {
  switch (status) {
    case "today":
      return { bg: "bg-emerald-50", text: "text-emerald-900", chip: "bg-emerald-100 text-emerald-800" };
    case "upcoming":
      return { bg: "bg-blue-50", text: "text-blue-900", chip: "bg-blue-100 text-blue-800" };
    case "completed":
      return { bg: "bg-slate-50", text: "text-slate-700", chip: "bg-slate-100 text-slate-600" };
    case "off_day":
      return { bg: "bg-zinc-50", text: "text-zinc-700", chip: "bg-zinc-100 text-zinc-600" };
  }
}

async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export default function MySchedulePage() {
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const shopId = sp.get("shop_id") ?? "";
  const staffId = sp.get("staff_id") ?? "";
  const staffIdentifier = sp.get("staff_identifier") ?? "";

  const [tab, setTab] = useState<"this" | "next">("this");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DayCard[]>([]);
  const [mode, setMode] = useState<"fixed" | "shift_based" | null>(null);
  const [workingHours, setWorkingHours] = useState<{
    start_time: string;
    end_time: string;
    break_minutes: number;
  } | null>(null);

  const canLoad = useMemo(() => Boolean(shopId && (staffId || staffIdentifier)), [shopId, staffId, staffIdentifier]);

  async function load(week: "this" | "next") {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ shop_id: shopId, week });
      if (staffId) qs.set("staff_id", staffId);
      if (staffIdentifier) qs.set("staff_identifier", staffIdentifier);
      const res = await fetch(`/api/attendance/my-schedule?${qs.toString()}`);
      if (!res.ok) throw new Error(await readErr(res));
      const j = (await res.json()) as {
        mode?: "fixed" | "shift_based";
        working_hours?: { start_time: string; end_time: string; break_minutes: number };
        days?: DayCard[];
      };
      setMode(j.mode ?? null);
      setWorkingHours(j.working_hours ?? null);
      setDays(j.days ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("employee.schedule.failedLoad"));
      setDays([]);
    } finally {
      setLoading(false);
    }
  }

  if (days.length === 0 && !loading && !error && canLoad) {
    void load(tab);
  }

  function dayStatusLabel(status: DayCard["status"]): string {
    return translateEmployeeStatus(t, status);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("employee.schedule.mySchedule")}
          </p>
          <p className="text-sm font-semibold text-zinc-900">{t("employee.schedule.upcomingShifts")}</p>
        </div>
        <Link
          href={shopId ? `/shop/${encodeURIComponent(shopId)}/clock` : "/clock"}
          className="text-sm font-semibold text-blue-600 underline"
        >
          {t("employee.common.back")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
            tab === "this" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900"
          }`}
          onClick={() => {
            setTab("this");
            void load("this");
          }}
        >
          {t("employee.status.this_week")}
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
            tab === "next" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900"
          }`}
          onClick={() => {
            setTab("next");
            void load("next");
          }}
        >
          {t("employee.status.next_week")}
        </button>
      </div>

      {mode === "fixed" && workingHours ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("employee.schedule.workingHours")}
          </p>
          <p className="mt-1 text-lg font-bold text-zinc-900">
            {workingHours.start_time} - {workingHours.end_time}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {t("employee.schedule.breakMinutes").replace("{minutes}", String(workingHours.break_minutes))}
          </p>
          <p className="mt-3 text-xs text-zinc-500">{t("employee.schedule.fixedScheduleNote")}</p>
        </div>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">{t("employee.common.loading")}</p> : null}

      {mode === "shift_based" ? (
        <div className="space-y-3">
          {days.map((d) => {
            const toneStyles = tone(d.status);
            if (d.status === "off_day" || d.shifts.length === 0) {
              return (
                <div key={d.date} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {weekdayLabel(d.date, locale)}, {dateLabel(d.date, locale)}
                      </p>
                      <p className="mt-2 text-lg font-bold text-zinc-800">{t("employee.schedule.offDay")}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneStyles.chip}`}>
                      {dayStatusLabel("off_day")}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={d.date} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {weekdayLabel(d.date, locale)}, {dateLabel(d.date, locale)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneStyles.chip}`}>
                    {dayStatusLabel(d.status)}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {d.shifts.map((s, idx) => (
                    <div
                      key={`${s.shop_id}-${idx}`}
                      className={`rounded-xl border border-zinc-200 ${toneStyles.bg} p-3`}
                    >
                      <p className="text-sm font-semibold text-zinc-900">
                        {s.shop_name ?? t("employee.common.shop")}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {t("employee.common.shift")}
                          </p>
                          <p className={`mt-0.5 text-sm font-semibold ${toneStyles.text}`}>
                            {s.template_name ?? t("employee.common.shift")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {t("employee.common.time")}
                          </p>
                          <p className={`mt-0.5 text-sm font-semibold ${toneStyles.text}`}>
                            {s.start_time} - {s.end_time}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {t("employee.common.break")}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-zinc-700">
                            {s.break_minutes} {t("employee.common.min")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!canLoad ? (
        <p className="text-sm text-zinc-500">{t("employee.schedule.selectStaffFirst")}</p>
      ) : null}
    </div>
  );
}
