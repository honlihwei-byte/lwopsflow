"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  newChecklistItemId,
  TASK_CHECKLIST_TEMPLATES,
  templateToChecklistItems,
} from "@/lib/retail-tasks/task-checklist";
import type { TaskChecklistItem } from "@/lib/retail-tasks/types";

type Props = {
  items: TaskChecklistItem[];
  onChange: (items: TaskChecklistItem[]) => void;
};

export function TaskChecklistEditor({ items, onChange }: Props) {
  const { t } = useI18n();
  const [dragId, setDragId] = useState<string | null>(null);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
      const fromIdx = sorted.findIndex((i) => i.id === fromId);
      const toIdx = sorted.findIndex((i) => i.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, moved!);
      onChange(sorted.map((item, index) => ({ ...item, sort_order: index })));
    },
    [items, onChange],
  );

  function addItem() {
    onChange([
      ...items,
      {
        id: newChecklistItemId(),
        label: "",
        required: true,
        sort_order: items.length,
      },
    ]);
  }

  function updateItem(id: string, patch: Partial<TaskChecklistItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    onChange(
      items
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, sort_order: index })),
    );
  }

  function applyTemplate(key: keyof typeof TASK_CHECKLIST_TEMPLATES) {
    onChange(templateToChecklistItems(key));
  }

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {t("tasks.form.checklistTitle")}
        </p>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(TASK_CHECKLIST_TEMPLATES) as Array<keyof typeof TASK_CHECKLIST_TEMPLATES>).map(
            (key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyTemplate(key)}
                className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] font-medium dark:border-zinc-600"
              >
                {t(`tasks.templates.${TASK_CHECKLIST_TEMPLATES[key].labelKey}` as "tasks.templates.dailyCleaning")}
              </button>
            ),
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("tasks.form.checklistEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) reorder(dragId, item.id);
                setDragId(null);
              }}
              className="flex items-center gap-2 rounded border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <span
                className="cursor-grab select-none text-zinc-400"
                title={t("tasks.form.dragToReorder")}
                aria-hidden
              >
                ⠿
              </span>
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                placeholder={t("tasks.form.checklistItemLabel")}
                className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
              <label className="flex shrink-0 items-center gap-1 text-[10px]">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(e) => updateItem(item.id, { required: e.target.checked })}
                />
                {t("tasks.form.checklistRequired")}
              </label>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 text-xs text-red-600"
                aria-label={t("tasks.form.checklistRemove")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addItem}
        className="w-full rounded border border-dashed border-zinc-300 px-2 py-1.5 text-xs font-medium dark:border-zinc-600"
      >
        {t("tasks.form.checklistAdd")}
      </button>
    </div>
  );
}
