import {
  isChecklistComplete,
  parseChecklistCompletionFromBody,
} from "@/lib/retail-tasks/task-checklist";
import { parsePhotoRecordsFromBody } from "@/lib/retail-tasks/task-proof-photos";
import { taskWasOverdueAtSubmit } from "@/lib/retail-tasks/task-overdue";
import type { RetailTaskRow, TaskChecklistItem, TaskProofPhotoRecord } from "@/lib/retail-tasks/types";

export const PHOTO_PRESET_OPTIONS = [0, 1, 3, 5] as const;

export function minRequiredTaskPhotos(task: Pick<RetailTaskRow, "min_photos" | "photo_required">): number {
  if (task.min_photos > 0) return task.min_photos;
  if (task.photo_required) return 1;
  return 0;
}

export function validateTaskSubmission(
  task: Pick<
    RetailTaskRow,
    "min_photos" | "photo_required" | "checklist_items" | "due_date" | "due_time"
  >,
  body: Record<string, unknown>,
  now = new Date(),
): {
  ok: true;
  photo_urls: TaskProofPhotoRecord[];
  checklist: Record<string, boolean> | null;
  overdue_reason: string | null;
} | { ok: false; error: string; code?: string } {
  const photo_urls = parsePhotoRecordsFromBody(body);
  const minPhotos = minRequiredTaskPhotos(task);
  const items = task.checklist_items ?? [];

  if (photo_urls.length < minPhotos) {
    return {
      ok: false,
      error:
        minPhotos > 1
          ? `At least ${minPhotos} photos are required for this task.`
          : "Photo proof is required.",
    };
  }

  let checklist: Record<string, boolean> | null = null;
  if (items.length > 0) {
    checklist = parseChecklistCompletionFromBody(items, body.checklist);
    if (!checklist) {
      return { ok: false, error: "Checklist completion is required." };
    }
    if (!isChecklistComplete(items, checklist)) {
      return { ok: false, error: "Complete all required checklist items before submitting." };
    }
  }

  const wasOverdue = taskWasOverdueAtSubmit(task.due_date, task.due_time, now);
  const overdueReasonRaw = String(body.overdue_reason ?? "").trim();
  if (wasOverdue && !overdueReasonRaw) {
    return {
      ok: false,
      error: "Overdue reason is required.",
      code: "overdue_reason_required",
    };
  }

  return {
    ok: true,
    photo_urls,
    checklist,
    overdue_reason: wasOverdue ? overdueReasonRaw : null,
  };
}

export function checklistItemsForDisplay(items: TaskChecklistItem[]): TaskChecklistItem[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}
