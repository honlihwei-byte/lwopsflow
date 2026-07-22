"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

export type ContextMenuAction =
  | "copy"
  | "paste"
  | "clear"
  | "duplicate_day"
  | "duplicate_week"
  | "mark_leave"
  | "mark_holiday";

export function ScheduleContextMenu({
  open,
  x,
  y,
  canPaste,
  onAction,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  canPaste: boolean;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const items: { action: ContextMenuAction; label: string; disabled?: boolean }[] = [
    { action: "copy", label: t("shops.editForm.scheduler.copy") },
    { action: "paste", label: t("shops.editForm.scheduler.paste"), disabled: !canPaste },
    { action: "clear", label: t("shops.editForm.scheduler.clear") },
    { action: "duplicate_day", label: t("shops.editForm.scheduler.duplicatePrevDay") },
    { action: "duplicate_week", label: t("shops.editForm.scheduler.duplicatePrevWeek") },
    { action: "mark_leave", label: t("shops.editForm.scheduler.markLeave") },
    { action: "mark_holiday", label: t("shops.editForm.scheduler.markHoliday") },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[60] min-w-[180px] rounded-xl border border-zinc-200/80 bg-white py-1 shadow-xl transition-all duration-100 dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            onAction(item.action);
            onClose();
          }}
          className="block w-full px-3 py-1.5 text-left text-[12px] text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
