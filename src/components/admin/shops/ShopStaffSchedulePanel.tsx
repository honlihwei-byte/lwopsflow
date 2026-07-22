"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";
import { formatTemplate } from "@/lib/i18n/format-template";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  buildCellView,
  CELL_STATE_CLASSES,
  wouldOverlapOtherShop,
  type OtherShopAssignment,
} from "@/lib/shifts/schedule-cell-status";
import { allActiveScheduleRows } from "@/lib/shifts/staff-schedules-dedupe";
import { getScheduleType } from "@/lib/shifts/schedule-type";
import { getScheduleStatusCode, isScheduleStatusCode } from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import {
  crossShopConfirmMessage,
  OFF_VALUE,
  ScheduleCellPicker,
} from "./ScheduleCellPicker";
import { EditShiftsModal, type ScheduleRow } from "./EditShiftsModal";
import type { ShopShiftTemplate } from "./ShopShiftTemplatesPanel";

type Staff = { id: string; staff_name: string; staff_code: string };

export type CrossShopScheduleRow = ScheduleRow & {
  shop_id: string;
  shop_name: string;
};

function mondayOfWeek(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

function cellHasTimedShifts(shifts: ScheduleRow[]): boolean {
  return (shifts as StaffScheduleRow[]).some(
    (s) => s.status === "active" && getScheduleType(s) === "SHIFT" && s.start_time && s.end_time,
  );
}

function cellAssignmentValue(shifts: ScheduleRow[], templates: ShopShiftTemplate[]): string {
  const active = allActiveScheduleRows(shifts as StaffScheduleRow[]);
  if (active.length === 0) return "";
  const nonShift = active.find((s) => getScheduleType(s) !== "SHIFT");
  if (nonShift) {
    const code = getScheduleStatusCode(nonShift);
    return code ?? OFF_VALUE;
  }
  const canonical = active[0]!;
  if (canonical.is_off_day) {
    const code = getScheduleStatusCode(canonical);
    return code ?? OFF_VALUE;
  }
  if (canonical.template_id && templates.some((tpl) => tpl.id === canonical.template_id)) {
    return canonical.template_id;
  }
  if (canonical.start_time && canonical.end_time) {
    const byTimes = templates.find(
      (tpl) => tpl.start_time === canonical.start_time && tpl.end_time === canonical.end_time,
    );
    if (byTimes) return byTimes.id;
  }
  return canonical.template_id ?? "";
}

async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function ShopStaffSchedulePanel({
  shopId,
  workTimeMode,
  shopHours,
}: {
  shopId: string;
  workTimeMode: "fixed" | "shift_based";
  shopHours: { opening: string; closing: string; break_minutes: number };
}) {
  const { t } = useI18n();
  const { toast, showSuccess, showError, dismiss } = useAdminToast();
  const today = malaysiaDateYmd(new Date());
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [crossShopRows, setCrossShopRows] = useState<CrossShopScheduleRow[]>([]);
  const [currentShopName, setCurrentShopName] = useState("");
  const [templates, setTemplates] = useState<ShopShiftTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [bulkDate, setBulkDate] = useState(today);
  const [quickMode, setQuickMode] = useState(true);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [pickerCell, setPickerCell] = useState<{ staffId: string; date: string } | null>(null);
  const [editModal, setEditModal] = useState<{
    staffId: string;
    staffName: string;
    date: string;
  } | null>(null);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const cellViewLabels = useMemo(
    () => ({
      notScheduledHere: t("shops.editForm.staffSchedule.notScheduledHere"),
      offDayLabel: t("shops.editForm.staffSchedule.offDayLabel"),
      workingAtOther: t("shops.editForm.staffSchedule.workingAtOther"),
      otherShopTimes: t("shops.editForm.staffSchedule.otherShopTimes"),
      assignedAtTooltip: t("shops.editForm.staffSchedule.assignedAtTooltip"),
      currentShopLine: t("shops.editForm.staffSchedule.thisShop"),
    }),
    [t],
  );
  const weekEnd = weekDays[6]!;

  const cellMap = useMemo(() => {
    const grouped = new Map<string, ScheduleRow[]>();
    for (const r of rows) {
      if (r.status !== "active") continue;
      const key = `${r.staff_id}:${r.shift_date}`;
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    const m = new Map<string, ScheduleRow[]>();
    for (const [key, list] of grouped) {
      m.set(key, allActiveScheduleRows(list as StaffScheduleRow[]) as ScheduleRow[]);
    }
    return m;
  }, [rows]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (workTimeMode !== "shift_based") return;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ from: weekStart, to: weekEnd });
        const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule?${qs}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(await readErr(res));
        const j = (await res.json()) as {
          staff?: Staff[];
          rows?: ScheduleRow[];
          crossShopRows?: CrossShopScheduleRow[];
          templates?: ShopShiftTemplate[];
          shop?: { name?: string };
        };
        setStaff(j.staff ?? []);
        setRows(j.rows ?? []);
        setCrossShopRows(j.crossShopRows ?? []);
        setCurrentShopName(j.shop?.name ?? "");
        setTemplates(j.templates ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
        setError(msg);
        if (opts?.silent) showError(msg);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [shopId, weekStart, weekEnd, workTimeMode, showError, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (bulkTemplateId || templates.length === 0) return;
    setBulkTemplateId(templates[0]!.id);
  }, [bulkTemplateId, templates]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ shopId?: string }>;
      if (!e.detail?.shopId || e.detail.shopId !== shopId) return;
      void load({ silent: true });
    };
    window.addEventListener("opsflow:templatesUpdated", handler as EventListener);
    return () => window.removeEventListener("opsflow:templatesUpdated", handler as EventListener);
  }, [shopId, load]);

  function otherAssignmentsFor(staffId: string, date: string): OtherShopAssignment[] {
    return buildCellView(
      [],
      crossShopRows,
      staffId,
      date,
      templates,
      currentShopName,
      cellViewLabels,
      (shop) => formatTemplate(cellViewLabels.workingAtOther, { shop }),
      (start, end) => formatTemplate(cellViewLabels.otherShopTimes, { start, end }),
    ).otherTimed;
  }

  async function confirmCrossShopIfNeeded(
    staffId: string,
    date: string,
    template: ShopShiftTemplate | null,
    isOff: boolean,
  ): Promise<boolean> {
    if (isOff || !template) return true;
    const conflict = wouldOverlapOtherShop(
      otherAssignmentsFor(staffId, date),
      template.start_time,
      template.end_time,
    );
    if (!conflict) return true;
    return window.confirm(crossShopConfirmMessage(t, conflict));
  }

  async function postSchedule(
    staffId: string,
    date: string,
    body: Record<string, unknown>,
  ): Promise<ScheduleRow> {
    const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, shift_date: date, ...body }),
    });
    if (!res.ok) throw new Error(await readErr(res));
    const j = (await res.json()) as { row?: ScheduleRow };
    if (!j.row) throw new Error("No row returned");
    return j.row;
  }

  async function replaceAssignment(
    staffId: string,
    date: string,
    body: Record<string, unknown>,
    opts?: { closeModal?: boolean; closePicker?: boolean },
  ) {
    const cellKey = `${staffId}:${date}`;
    setError(null);
    setSavingCellKey(cellKey);
    try {
      await postSchedule(staffId, date, body);
      await load({ silent: true });
      showSuccess(t("shops.editForm.staffSchedule.savedSuccess"));
      if (opts?.closeModal) setEditModal(null);
      if (opts?.closePicker) setPickerCell(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
      setError(msg);
      showError(msg);
    } finally {
      setSavingCellKey((k) => (k === cellKey ? null : k));
    }
  }

  async function quickAssign(staffId: string, date: string, value: string) {
    const cellKey = `${staffId}:${date}`;
    if (savingCellKey === cellKey) return;

    const current = cellAssignmentValue(cellMap.get(cellKey) ?? [], templates);
    if (value === current) {
      setPickerCell(null);
      return;
    }
    if (value === OFF_VALUE || value === "RD") {
      await replaceAssignment(
        staffId,
        date,
        { is_off_day: true, leave_code: "RD" },
        { closePicker: true },
      );
      return;
    }
    if (isScheduleStatusCode(value)) {
      await replaceAssignment(
        staffId,
        date,
        { is_off_day: true, leave_code: value },
        { closePicker: true },
      );
      return;
    }
    if (!value) {
      setPickerCell(null);
      return;
    }
    const tpl = templates.find((item) => item.id === value);
    if (!(await confirmCrossShopIfNeeded(staffId, date, tpl ?? null, false))) return;
    const existing = cellMap.get(cellKey) ?? [];
    await replaceAssignment(
      staffId,
      date,
      { template_id: value, is_off_day: false, add: cellHasTimedShifts(existing) },
      { closePicker: true },
    );
  }

  async function deleteShift(scheduleId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/staff-schedule/${encodeURIComponent(scheduleId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(await readErr(res));
      await load({ silent: true });
      showSuccess(t("shops.editForm.staffSchedule.savedSuccess"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
      setError(msg);
      showError(msg);
    }
  }

  async function markOff(staffId: string, date: string) {
    await replaceAssignment(
      staffId,
      date,
      { is_off_day: true, leave_code: "RD" },
      { closeModal: true },
    );
  }

  async function replaceShift(staffId: string, date: string, templateId: string) {
    const tpl = templates.find((item) => item.id === templateId);
    if (!(await confirmCrossShopIfNeeded(staffId, date, tpl ?? null, false))) return;
    const existing = cellMap.get(`${staffId}:${date}`) ?? [];
    await replaceAssignment(
      staffId,
      date,
      {
        template_id: templateId,
        is_off_day: false,
        add: cellHasTimedShifts(existing),
      },
      { closeModal: true },
    );
  }

  async function bulkAssign(isOff = false) {
    if (selectedStaff.length === 0) {
      setError(t("shops.editForm.staffSchedule.selectStaff"));
      return;
    }
    if (!isOff && !bulkTemplateId) {
      setError(t("shops.editForm.staffSchedule.template"));
      return;
    }
    const bulkTpl = templates.find((item) => item.id === bulkTemplateId);
    if (!isOff && bulkTpl) {
      for (const staffId of selectedStaff) {
        if (!(await confirmCrossShopIfNeeded(staffId, bulkDate, bulkTpl, false))) return;
      }
    }
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_ids: selectedStaff,
          shift_date: bulkDate,
          template_id: isOff ? undefined : bulkTemplateId,
          is_off_day: isOff,
        }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      await load({ silent: true });
      showSuccess(t("shops.editForm.staffSchedule.bulkSavedSuccess"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
      setError(msg);
      showError(msg);
    }
  }

  async function copyPreviousWeek() {
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule/copy-week`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      await load({ silent: true });
      showSuccess(t("shops.editForm.staffSchedule.savedSuccess"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
      setError(msg);
      showError(msg);
    }
  }

  async function copyPreviousDay(date: string) {
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule/copy-day`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_date: date }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      await load({ silent: true });
      showSuccess(t("shops.editForm.staffSchedule.savedSuccess"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.copyDayFailed");
      setError(msg);
      showError(msg);
    }
  }

  function openCell(staffId: string, staffName: string, date: string) {
    if (quickMode) {
      setPickerCell({ staffId, date });
      return;
    }
    setEditModal({ staffId, staffName, date });
  }

  if (workTimeMode === "fixed") {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="font-semibold text-emerald-900 dark:text-emerald-100">
          {t("shops.detail.scheduleFixed.title")}
        </p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          {t("shops.detail.scheduleFixed.staffHoursPrefix")} {shopHours.opening}–{shopHours.closing} (
          {shopHours.break_minutes}
          {t("shops.detail.scheduleFixed.minuteBreak")}). {t("shops.detail.scheduleFixed.noPerStaff")}
        </p>
      </div>
    );
  }

  const modalShifts = editModal
    ? (cellMap.get(`${editModal.staffId}:${editModal.date}`) ?? [])
    : [];

  const modalOther = editModal
    ? otherAssignmentsFor(editModal.staffId, editModal.date)
    : [];

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            {t("shops.editForm.staffSchedule.title")}
          </p>
          <p className="text-xs text-zinc-500">{t("shops.editForm.staffSchedule.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            {t("shops.editForm.staffSchedule.prevWeek")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOfWeek(today))}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            {t("shops.editForm.staffSchedule.thisWeek")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            {t("shops.editForm.staffSchedule.nextWeek")}
          </button>
          <button
            type="button"
            onClick={() => void copyPreviousWeek()}
            className="rounded bg-zinc-800 px-2 py-1 text-xs font-semibold text-white dark:bg-zinc-200 dark:text-zinc-900"
          >
            {t("shops.editForm.staffSchedule.copyPrevWeek")}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={quickMode}
          onChange={(e) => {
            setQuickMode(e.target.checked);
            setPickerCell(null);
          }}
        />
        <span>
          {t("shops.editForm.staffSchedule.quickMode")} — {t("shops.editForm.staffSchedule.quickModeHint")}
        </span>
      </label>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        <span className="font-semibold text-zinc-600 dark:text-zinc-400">
          {t("shops.editForm.staffSchedule.legendTitle")}:
        </span>
        <span>{t("shops.editForm.staffSchedule.legendEmpty")}</span>
        <span>{t("shops.editForm.staffSchedule.legendHere")}</span>
        <span>{t("shops.editForm.staffSchedule.legendElsewhere")}</span>
        <span>{t("shops.editForm.staffSchedule.legendOff")}</span>
        <span>{t("shops.editForm.staffSchedule.legendConflict")}</span>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {loading ? <p className="text-xs text-zinc-500">{t("shops.editForm.staffSchedule.loading")}</p> : null}

      {staff.length === 0 && !loading ? (
        <p className="text-sm text-zinc-500">
          {t("shops.editForm.staffSchedule.noStaff")}
          <HelpInfoIcon helpKey="authorizedStaff" />
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900">
                <th className="sticky left-0 z-10 bg-zinc-100 px-2 py-2 text-left dark:bg-zinc-900">
                  {t("shops.editForm.staffSchedule.staff")}
                </th>
                {weekDays.map((d) => (
                  <th key={d} className="min-w-[88px] px-1 py-2 text-center font-medium">
                    {dayLabel(d)}
                    <button
                      type="button"
                      title={t("shops.editForm.staffSchedule.copyPrevDayTitle")}
                      onClick={() => void copyPreviousDay(d)}
                      className="ml-1 text-[10px] text-blue-600 underline"
                    >
                      {t("shops.editForm.staffSchedule.copyCell")}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium dark:bg-zinc-950">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={selectedStaff.includes(s.id)}
                        onChange={(e) => {
                          setSelectedStaff((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                          );
                        }}
                      />
                      <span>
                        {s.staff_name}
                        <span className="block font-normal text-zinc-500">{s.staff_code}</span>
                      </span>
                    </label>
                  </td>
                  {weekDays.map((d) => {
                    const key = `${s.id}:${d}`;
                    const cellShifts = cellMap.get(key) ?? [];
                    const view = buildCellView(
                      cellShifts,
                      crossShopRows,
                      s.id,
                      d,
                      templates,
                      currentShopName,
                      cellViewLabels,
                      (shop) => formatTemplate(cellViewLabels.workingAtOther, { shop }),
                      (start, end) =>
                        formatTemplate(cellViewLabels.otherShopTimes, { start, end }),
                    );
                    const isPickerOpen =
                      pickerCell?.staffId === s.id && pickerCell?.date === d && quickMode;
                    const currentValue = cellAssignmentValue(cellShifts, templates);
                    const isSaving = savingCellKey === key;

                    return (
                      <td key={d} className="relative px-0.5 py-1 align-top">
                        {isPickerOpen ? (
                          <ScheduleCellPicker
                            open
                            currentValue={currentValue}
                            otherAssignments={view.otherTimed}
                            templates={templates}
                            busy={isSaving}
                            onSelect={(value) => void quickAssign(s.id, d, value)}
                            onClose={() => setPickerCell(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            title={view.tooltip}
                            onClick={() => openCell(s.id, s.staff_name, d)}
                            className={`w-full min-h-[44px] rounded-md px-1 py-1 text-center leading-tight ${CELL_STATE_CLASSES[view.state]}`}
                          >
                            <div className="text-[10px] font-semibold leading-snug">
                              <div>{view.primary}</div>
                              {view.secondary ? (
                                <div className="font-normal opacity-80">{view.secondary}</div>
                              ) : null}
                              {view.more > 0 ? (
                                <div className="font-normal opacity-80">
                                  +{view.more} {t("shops.editForm.staffSchedule.moreShifts")}
                                </div>
                              ) : null}
                            </div>
                            {isSaving ? (
                              <div className="mt-0.5 text-[10px] opacity-80">
                                {t("shops.editForm.staffSchedule.savingCell")}
                              </div>
                            ) : null}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditShiftsModal
        open={editModal != null}
        staffName={editModal?.staffName ?? ""}
        date={editModal?.date ?? ""}
        shifts={modalShifts}
        otherAssignments={modalOther}
        templates={templates}
        busy={savingCellKey != null}
        onClose={() => setEditModal(null)}
        onReplaceShift={(templateId) => {
          if (!editModal) return;
          void replaceShift(editModal.staffId, editModal.date, templateId);
        }}
        onMarkOff={() => {
          if (editModal) void markOff(editModal.staffId, editModal.date);
        }}
        onDelete={(id) => void deleteShift(id)}
      />

      <div className="rounded-lg border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
        <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          {t("shops.editForm.staffSchedule.bulkAssignTitle")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
            {t("shops.editForm.staffSchedule.date")}
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
            <span>
              {t("shops.editForm.staffSchedule.shiftTemplate")}
              <HelpInfoIcon helpKey="shiftTemplate" />
            </span>
            <select
              value={bulkTemplateId}
              onChange={(e) => setBulkTemplateId(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} {tpl.start_time}–{tpl.end_time}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void bulkAssign(false)}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t("shops.editForm.shiftsModal.assignShift")}
          </button>
          <button
            type="button"
            onClick={() => void bulkAssign(true)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
          >
            {t("shops.editForm.staffSchedule.markOff")}
          </button>
        </div>
      </div>

      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={dismiss} />
    </div>
  );
}
