"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { formatTemplate } from "@/lib/i18n/format-template";
import type { OtherShopAssignment } from "@/lib/shifts/schedule-cell-status";
import type { ShopShiftTemplate } from "./ShopShiftTemplatesPanel";

export type ScheduleRow = {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  template_id: string | null;
  is_off_day: boolean;
  status: string;
};

function formatShiftLine(r: ScheduleRow, templates: ShopShiftTemplate[], offLabel: string): string {
  if (r.is_off_day) return offLabel;
  if (r.start_time && r.end_time) {
    const tpl = templates.find((t) => t.id === r.template_id);
    const name = tpl?.name ?? `${r.start_time}–${r.end_time}`;
    return `${name} (${r.start_time}–${r.end_time})`;
  }
  return "—";
}

function statusLabel(
  shifts: ScheduleRow[],
  templates: ShopShiftTemplate[],
  otherAssignments: OtherShopAssignment[],
  t: (key: string) => string,
): string {
  const active = shifts.filter((s) => s.status === "active");
  if (active.some((s) => s.is_off_day)) return t("shops.editForm.shiftsModal.offDay");
  const timed = active.filter((s) => !s.is_off_day && s.start_time && s.end_time);
  if (timed.length === 0) {
    if (otherAssignments[0]) {
      const o = otherAssignments[0]!;
      return `${formatTemplate(t("shops.editForm.staffSchedule.workingAtOther"), {
        shop: o.shop_name,
      })} (${o.start_time}–${o.end_time})`;
    }
    return t("shops.editForm.staffSchedule.notScheduledHere");
  }
  const first = timed[0]!;
  const tpl = templates.find((item) => item.id === first.template_id);
  const name = tpl?.name ?? `${first.start_time}–${first.end_time}`;
  return `${t("shops.editForm.staffSchedule.currentShiftPrefix")} ${formatTemplate(
    t("shops.editForm.shiftsModal.currentShiftLine"),
    { name, start: first.start_time!, end: first.end_time! },
  )}`;
}

export function EditShiftsModal({
  open,
  staffName,
  date,
  shifts,
  otherAssignments = [],
  templates,
  busy,
  onClose,
  onReplaceShift,
  onMarkOff,
  onDelete,
}: {
  open: boolean;
  staffName: string;
  date: string;
  shifts: ScheduleRow[];
  otherAssignments?: OtherShopAssignment[];
  templates: ShopShiftTemplate[];
  busy: boolean;
  onClose: () => void;
  onReplaceShift: (templateId: string) => void;
  onMarkOff: () => void;
  onDelete: (scheduleId: string) => void;
}) {
  const { t } = useI18n();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (templates.length === 0) {
      setSelectedTemplateId("");
      return;
    }
    const active = shifts.filter((s) => s.status === "active");
    const timed = active.find((s) => !s.is_off_day && s.template_id);
    setSelectedTemplateId(
      timed?.template_id && templates.some((tpl) => tpl.id === timed.template_id)
        ? timed.template_id
        : templates[0]!.id,
    );
  }, [open, templates, shifts]);

  if (!open) return null;

  const active = shifts.filter((s) => s.status === "active");
  const isOff = active.some((s) => s.is_off_day);
  const timedShifts = active.filter((s) => !s.is_off_day && s.start_time && s.end_time);
  const hasAssignment = isOff || timedShifts.length > 0;
  const offLabel = t("shops.editForm.staffSchedule.offDayLabel");

  function handleReplace() {
    if (!selectedTemplateId || busy) return;
    onReplaceShift(selectedTemplateId);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("shops.editForm.shiftsModal.title")}
          </p>
          <p className="text-xs text-zinc-500">
            {staffName} · {date}
          </p>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-auto p-4">
          {otherAssignments.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {t("shops.editForm.staffSchedule.alreadyAssigned")}
              </p>
              {otherAssignments.map((a) => (
                <p
                  key={`${a.shop_id}:${a.start_time}`}
                  className="mt-1 text-sm text-amber-900 dark:text-amber-100"
                >
                  {a.shop_name}
                  <span className="block font-mono text-xs">
                    {a.start_time}–{a.end_time}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("shops.editForm.shiftsModal.currentStatus")}
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                isOff ? "text-zinc-700 dark:text-zinc-300" : "text-sky-800 dark:text-sky-200"
              }`}
            >
              {statusLabel(shifts, templates, otherAssignments, t)}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {hasAssignment
                ? t("shops.editForm.shiftsModal.replaceShift")
                : t("shops.editForm.shiftsModal.assignShift")}
            </p>
            {templates.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t("shops.editForm.shiftsModal.noTemplatesLong")}
              </p>
            ) : (
              <>
                <select
                  className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={selectedTemplateId}
                  disabled={busy}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.start_time}–{tpl.end_time})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !selectedTemplateId}
                  onClick={handleReplace}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? t("shops.editForm.shiftsModal.saving")
                    : hasAssignment
                      ? t("shops.editForm.shiftsModal.replaceShift")
                      : t("shops.editForm.shiftsModal.assignShift")}
                </button>
                {hasAssignment ? (
                  <p className="text-[11px] text-zinc-500">
                    {t("shops.editForm.shiftsModal.multiShiftHint")}
                  </p>
                ) : null}
                {isOff ? (
                  <p className="text-[11px] text-zinc-500">
                    {t("shops.editForm.shiftsModal.assignRemovesOff")}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {timedShifts.length > 1 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {t("shops.editForm.shiftsModal.existingShifts")}
              </p>
              <ul className="space-y-2">
                {timedShifts.map((s, idx) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">
                        {t("shops.editForm.shiftsModal.shiftN")} {idx + 1}
                      </p>
                      <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatShiftLine(s, templates, offLabel)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(s.id)}
                      className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
                    >
                      {t("shops.editForm.shiftsModal.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-100 p-4 dark:border-zinc-800 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={onMarkOff}
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
          >
            {t("shops.editForm.shiftsModal.markOff")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("shops.editForm.shiftsModal.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
