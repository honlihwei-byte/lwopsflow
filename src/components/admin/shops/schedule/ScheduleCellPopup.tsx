"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import type { OtherShopAssignment } from "@/lib/shifts/schedule-cell-status";
import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";
import { findTemplateByName } from "./schedule-utils";
import { cellColorClasses, resolveShiftColorKey } from "./schedule-colors";

export type QuickOption = {
  id: string;
  label: string;
  sublabel?: string;
  value: string;
  colorKey: ReturnType<typeof resolveShiftColorKey>;
};

export function ScheduleCellPopup({
  open,
  currentValue,
  otherAssignments,
  templates,
  busy,
  anchorRect,
  onSelect,
  onCustom,
  onClose,
}: {
  open: boolean;
  currentValue: string;
  otherAssignments: OtherShopAssignment[];
  templates: ShopShiftTemplate[];
  busy: boolean;
  anchorRect: DOMRect | null;
  onSelect: (value: string) => void;
  onCustom: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const quickOptions: QuickOption[] = [];

  const morning = findTemplateByName(templates, "morning");
  const noon = findTemplateByName(templates, "noon");
  const full = findTemplateByName(templates, "full");
  const half = findTemplateByName(templates, "half");

  if (morning) {
    quickOptions.push({
      id: "morning",
      label: morning.name,
      sublabel: `${morning.start_time}–${morning.end_time}`,
      value: morning.id,
      colorKey: "morning",
    });
  }
  if (noon) {
    quickOptions.push({
      id: "noon",
      label: noon.name,
      sublabel: `${noon.start_time}–${noon.end_time}`,
      value: noon.id,
      colorKey: "noon",
    });
  }
  if (full) {
    quickOptions.push({
      id: "full",
      label: full.name,
      sublabel: `${full.start_time}–${full.end_time}`,
      value: full.id,
      colorKey: "full",
    });
  }
  if (half) {
    quickOptions.push({
      id: "half",
      label: half.name,
      sublabel: `${half.start_time}–${half.end_time}`,
      value: half.id,
      colorKey: "half",
    });
  }

  for (const tpl of templates) {
    if (quickOptions.some((q) => q.value === tpl.id)) continue;
    quickOptions.push({
      id: tpl.id,
      label: tpl.name,
      sublabel: `${tpl.start_time}–${tpl.end_time}`,
      value: tpl.id,
      colorKey: resolveShiftColorKey(tpl.id, templates, "here"),
    });
  }

  const leaveOptions: QuickOption[] = [
    { id: "off", label: "OFF", value: "RD", colorKey: "off" },
    { id: "al", label: t("shops.editForm.staffSchedule.leaveAl"), value: "AL", colorKey: "annual" },
    { id: "mc", label: t("shops.editForm.staffSchedule.leaveMc"), value: "MC", colorKey: "medical" },
    { id: "training", label: t("shops.editForm.scheduler.training"), value: "EL", colorKey: "training" },
  ];

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const panelW = 200;
  const panelH = 320;
  let left = anchorRect.right + 4;
  let top = anchorRect.top;
  if (left + panelW > viewportW - 8) left = anchorRect.left - panelW - 4;
  if (top + panelH > viewportH - 8) top = viewportH - panelH - 8;
  if (top < 8) top = 8;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-[200px] rounded-xl border border-zinc-200/80 bg-white/95 shadow-xl backdrop-blur-sm transition-all duration-150 dark:border-zinc-700 dark:bg-zinc-900/95"
      style={{ left, top }}
    >
      {otherAssignments.length > 0 ? (
        <div className="border-b border-amber-200/80 bg-amber-50/90 px-2.5 py-2 dark:border-amber-900 dark:bg-amber-950/50">
          <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">
            {t("shops.editForm.staffSchedule.alreadyAssigned")}
          </p>
          {otherAssignments.map((a) => (
            <p key={`${a.shop_id}:${a.start_time}`} className="text-[10px] text-amber-900 dark:text-amber-100">
              {a.shop_name} · {a.start_time}–{a.end_time}
            </p>
          ))}
        </div>
      ) : null}

      <div className="max-h-[280px] overflow-y-auto p-1.5">
        <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
          {t("shops.editForm.scheduler.shifts")}
        </p>
        {quickOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={busy}
            onClick={() => onSelect(opt.value)}
            className={`mb-0.5 flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all duration-100 ${cellColorClasses(opt.colorKey)} ${
              currentValue === opt.value ? "ring-2 ring-blue-400 ring-offset-1" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{opt.label}</div>
              {opt.sublabel ? (
                <div className="text-[10px] opacity-75">{opt.sublabel}</div>
              ) : null}
            </div>
          </button>
        ))}

        <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
        <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
          {t("shops.editForm.staffSchedule.leaveSection")}
        </p>
        {leaveOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={busy}
            onClick={() => onSelect(opt.value)}
            className={`mb-0.5 flex w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all duration-100 ${cellColorClasses(opt.colorKey)} ${
              currentValue === opt.value ? "ring-2 ring-blue-400 ring-offset-1" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={onCustom}
          className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t("shops.editForm.scheduler.custom")}…
        </button>
      </div>
    </div>
  );
}
