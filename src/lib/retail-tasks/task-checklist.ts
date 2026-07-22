import type { TaskChecklistItem } from "@/lib/retail-tasks/types";

export const TASK_CHECKLIST_TEMPLATES: Record<
  string,
  { labelKey: string; items: Array<Omit<TaskChecklistItem, "id"> & { id?: string }> }
> = {
  daily_cleaning: {
    labelKey: "dailyCleaning",
    items: [
      { id: "sweep_floor", label: "Sweep Floor", required: true, sort_order: 0 },
      { id: "mop_floor", label: "Mop Floor", required: true, sort_order: 1 },
      { id: "clean_glass", label: "Clean Glass", required: true, sort_order: 2 },
      { id: "empty_trash", label: "Empty Trash", required: true, sort_order: 3 },
    ],
  },
  pop_installation: {
    labelKey: "popInstallation",
    items: [
      { id: "install_pop", label: "Install POP", required: true, sort_order: 0 },
      { id: "check_price_tag", label: "Check Price Tag", required: true, sort_order: 1 },
      { id: "display_photo", label: "Take Display Photo", required: true, sort_order: 2 },
    ],
  },
};

export function newChecklistItemId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeChecklistItems(raw: unknown): TaskChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const label = String(r.label ?? "").trim();
      if (!label) return null;
      return {
        id: String(r.id ?? newChecklistItemId()),
        label,
        required: r.required !== false,
        sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : index,
      };
    })
    .filter((x): x is TaskChecklistItem => x != null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function templateToChecklistItems(
  templateKey: keyof typeof TASK_CHECKLIST_TEMPLATES,
): TaskChecklistItem[] {
  const tpl = TASK_CHECKLIST_TEMPLATES[templateKey];
  if (!tpl) return [];
  return tpl.items.map((item, index) => ({
    id: item.id ?? newChecklistItemId(),
    label: item.label,
    required: item.required !== false,
    sort_order: item.sort_order ?? index,
  }));
}

export function isChecklistComplete(
  items: TaskChecklistItem[],
  completed: Record<string, boolean> | null | undefined,
): boolean {
  if (items.length === 0) return true;
  if (!completed) return false;
  return items.filter((i) => i.required).every((i) => completed[i.id] === true);
}

export function parseChecklistCompletionFromBody(
  items: TaskChecklistItem[],
  raw: unknown,
): Record<string, boolean> | null {
  if (items.length === 0) return null;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const item of items) {
    out[item.id] = body[item.id] === true;
  }
  return out;
}

/** @deprecated Use task.checklist_items */
export function taskRequiresCleaningChecklist(category: string): boolean {
  return category === "cleaning_check";
}
