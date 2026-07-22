"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";
import type { ScheduleRow } from "../EditShiftsModal";
import { cellAssignmentValue, cellKey, dayShort, findTemplateByName, isWeekend } from "./schedule-utils";
import { OFF_VALUE } from "../ScheduleCellPicker";

export function ScheduleDaySummaries({
  weekDays,
  staffIds,
  cellMap,
  templates,
  today,
}: {
  weekDays: string[];
  staffIds: string[];
  cellMap: Map<string, ScheduleRow[]>;
  templates: ShopShiftTemplate[];
  today: string;
}) {
  const { t } = useI18n();
  const morningTpl = findTemplateByName(templates, "morning");
  const noonTpl = findTemplateByName(templates, "noon");

  return (
    <div className="flex border-b border-zinc-100 dark:border-zinc-800">
      <div className="sticky left-0 z-20 w-[160px] shrink-0 bg-zinc-50/95 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 backdrop-blur dark:bg-zinc-900/95">
        {t("shops.editForm.scheduler.dailySummary")}
      </div>
      {weekDays.map((d) => {
        let morning = 0;
        let noon = 0;
        let off = 0;
        let missing = 0;

        for (const sid of staffIds) {
          const shifts = cellMap.get(cellKey(sid, d)) ?? [];
          const val = cellAssignmentValue(shifts, templates);
          if (!val) {
            missing++;
            continue;
          }
          if (val === OFF_VALUE || val === "RD" || val === "NS") {
            off++;
          } else if (morningTpl && val === morningTpl.id) {
            morning++;
          } else if (noonTpl && val === noonTpl.id) {
            noon++;
          }
        }

        const coverage = staffIds.length > 0 ? Math.round(((staffIds.length - missing) / staffIds.length) * 100) : 0;

        return (
          <div
            key={d}
            className={`min-w-[72px] flex-1 border-l border-zinc-100 px-1 py-1.5 dark:border-zinc-800 ${
              d === today ? "bg-amber-50/50 dark:bg-amber-950/20" : isWeekend(d) ? "bg-zinc-50/50 dark:bg-zinc-900/30" : ""
            }`}
          >
            <div className="text-[9px] font-semibold text-zinc-500">{dayShort(d)}</div>
            <div className="mt-0.5 space-y-0.5 text-[8px] leading-tight text-zinc-400">
              <div className="text-blue-600 dark:text-blue-400">
                AM {morning}
              </div>
              <div className="text-emerald-600 dark:text-emerald-400">
                PM {noon}
              </div>
              <div>OFF {off}</div>
              <div className={missing > 0 ? "text-amber-600" : ""}>
                −{missing} · {coverage}%
              </div>
            </div>
          </div>
        );
      })}
      <div className="w-[100px] shrink-0" />
    </div>
  );
}

export function ScheduleEmployeeSummary({
  staffId,
  weekDays,
  cellMap,
  templates,
}: {
  staffId: string;
  weekDays: string[];
  cellMap: Map<string, ScheduleRow[]>;
  templates: ShopShiftTemplate[];
}) {
  let hours = 0;
  let working = 0;
  let off = 0;
  let leave = 0;

  for (const d of weekDays) {
    const shifts = cellMap.get(cellKey(staffId, d)) ?? [];
    const val = cellAssignmentValue(shifts, templates);
    if (!val) continue;
    if (val === OFF_VALUE || val === "RD" || val === "NS") {
      off++;
    } else if (["AL", "MC", "UL", "EL"].includes(val)) {
      leave++;
    } else {
      working++;
      for (const s of shifts) {
        if (!s.is_off_day && s.start_time && s.end_time) {
          const [sh, sm] = s.start_time.slice(0, 5).split(":").map(Number);
          const [eh, em] = s.end_time.slice(0, 5).split(":").map(Number);
          let endM = eh! * 60 + em!;
          let startM = sh! * 60 + sm!;
          if (endM <= startM) endM += 24 * 60;
          hours += (endM - startM - (s.break_minutes ?? 0)) / 60;
        }
      }
    }
  }

  const ot = Math.max(0, Math.round((hours - 48) * 10) / 10);

  return (
    <div className="flex h-[38px] w-[100px] shrink-0 flex-col justify-center px-1.5 text-[8px] leading-tight text-zinc-400">
      <div>{hours.toFixed(0)}h</div>
      <div>W{working} O{off} L{leave}</div>
      {ot > 0 ? <div className="text-amber-600">OT {ot}h</div> : null}
    </div>
  );
}
