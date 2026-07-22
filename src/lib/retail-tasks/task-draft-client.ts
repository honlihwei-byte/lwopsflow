import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";

export type TaskDraftPhoto = TaskProofPhotoRecord & { preview_url?: string | null };

export type TaskDraftPayload = {
  photo_urls?: TaskProofPhotoRecord[];
  checklist?: Record<string, boolean>;
  comment?: string;
};

export type SaveDraftResult =
  | { ok: true; autosave_available?: boolean }
  | { ok: false; error: string; unavailable?: boolean };

async function readJson(res: Response): Promise<{
  error?: string;
  autosave_available?: boolean;
  skipped?: boolean;
  draft?: unknown;
}> {
  try {
    return (await res.json()) as {
      error?: string;
      autosave_available?: boolean;
      skipped?: boolean;
      draft?: unknown;
    };
  } catch {
    return {};
  }
}

export async function loadTaskDraft(
  shopId: string,
  taskId: string,
  staffId: string,
): Promise<{
  checklist: Record<string, boolean>;
  comment: string;
  photos: TaskDraftPhoto[];
  autosave_available: boolean;
} | null> {
  const qs = new URLSearchParams({ staff_id: staffId });
  const res = await fetch(
    `/api/shops/${encodeURIComponent(shopId)}/retail-tasks/${encodeURIComponent(taskId)}/draft?${qs}`,
  );

  const body = await readJson(res);

  if (!res.ok) {
    if (body.autosave_available === false || res.status === 503) {
      console.warn("[task-draft] load skipped — autosave unavailable", { taskId, staffId });
      return null;
    }
    console.warn("[task-draft] load failed", { taskId, staffId, error: body.error });
    return null;
  }

  const j = body as {
    draft?: {
      checklist_completed?: Record<string, boolean> | null;
      comment?: string | null;
      photo_urls?: TaskDraftPhoto[];
    } | null;
    autosave_available?: boolean;
  };

  if (j.autosave_available === false) {
    console.warn("[task-draft] autosave unavailable for task", { taskId, staffId });
    return null;
  }

  if (!j.draft) return null;

  return {
    checklist: j.draft.checklist_completed ?? {},
    comment: j.draft.comment ?? "",
    photos: j.draft.photo_urls ?? [],
    autosave_available: true,
  };
}

export async function saveTaskDraft(
  shopId: string,
  taskId: string,
  staffId: string,
  payload: TaskDraftPayload,
): Promise<SaveDraftResult> {
  const res = await fetch(
    `/api/shops/${encodeURIComponent(shopId)}/retail-tasks/${encodeURIComponent(taskId)}/draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, ...payload }),
    },
  );

  const body = await readJson(res);

  if (body.skipped || body.autosave_available === false) {
    console.warn("[task-draft] save skipped — autosave unavailable", { taskId, staffId });
    return { ok: true, autosave_available: false };
  }

  if (!res.ok) {
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }

  return { ok: true, autosave_available: true };
}
