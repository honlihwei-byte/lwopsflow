import { normalizePhotoRecords } from "@/lib/retail-tasks/task-proof-photos";
import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type RetailTaskDraftRow = {
  id: string;
  task_id: string;
  staff_id: string;
  photo_urls: TaskProofPhotoRecord[];
  checklist_completed: Record<string, boolean> | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type DraftWriteResult = {
  draft: RetailTaskDraftRow | null;
  autosave_available: boolean;
  skipped?: boolean;
};

let draftTableProbe: boolean | null = null;

export function isDraftTableMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("retail_task_drafts") &&
    (lower.includes("could not find") ||
      lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      (lower.includes("relation") && lower.includes("does not exist")))
  );
}

export function logDraftTableUnavailable(context: string, error?: string): void {
  console.warn("[task-draft] autosave disabled — retail_task_drafts unavailable", {
    context,
    error: error ?? null,
    migration: "supabase/migrations/065_task_drafts.sql",
  });
}

/** Probe once per process whether retail_task_drafts exists. */
export async function isTaskDraftAutosaveAvailable(supabase: Supabase): Promise<boolean> {
  if (draftTableProbe != null) return draftTableProbe;

  const { error } = await supabase.from("retail_task_drafts").select("id").limit(1);
  if (error && isDraftTableMissingError(error.message)) {
    draftTableProbe = false;
    logDraftTableUnavailable("schema probe", error.message);
    return false;
  }

  draftTableProbe = true;
  return true;
}

function normalizeDraft(row: Record<string, unknown>): RetailTaskDraftRow {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    staff_id: String(row.staff_id),
    photo_urls: normalizePhotoRecords(row.photo_urls),
    checklist_completed:
      row.checklist_completed != null && typeof row.checklist_completed === "object"
        ? (row.checklist_completed as Record<string, boolean>)
        : null,
    comment: row.comment != null ? String(row.comment) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getTaskDraft(
  supabase: Supabase,
  taskId: string,
  staffId: string,
): Promise<RetailTaskDraftRow | null> {
  if (!(await isTaskDraftAutosaveAvailable(supabase))) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("retail_task_drafts")
      .select("*")
      .eq("task_id", taskId)
      .eq("staff_id", staffId)
      .maybeSingle();
    if (error) {
      if (isDraftTableMissingError(error.message)) {
        draftTableProbe = false;
        logDraftTableUnavailable("getTaskDraft", error.message);
        return null;
      }
      throw new Error(error.message);
    }
    if (!data) return null;
    return normalizeDraft(data as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDraftTableMissingError(message)) {
      draftTableProbe = false;
      logDraftTableUnavailable("getTaskDraft", message);
      return null;
    }
    throw error;
  }
}

export async function upsertTaskDraft(
  supabase: Supabase,
  params: {
    task_id: string;
    staff_id: string;
    photo_urls?: TaskProofPhotoRecord[];
    checklist_completed?: Record<string, boolean> | null;
    comment?: string | null;
  },
): Promise<DraftWriteResult> {
  if (!(await isTaskDraftAutosaveAvailable(supabase))) {
    return { draft: null, autosave_available: false, skipped: true };
  }

  try {
    const now = new Date().toISOString();
    const existing = await getTaskDraft(supabase, params.task_id, params.staff_id);

    const payload = {
      task_id: params.task_id,
      staff_id: params.staff_id,
      photo_urls: params.photo_urls ?? existing?.photo_urls ?? [],
      checklist_completed:
        params.checklist_completed !== undefined
          ? params.checklist_completed
          : (existing?.checklist_completed ?? null),
      comment: params.comment !== undefined ? params.comment : (existing?.comment ?? null),
      updated_at: now,
    };

    if (existing) {
      const { data, error } = await supabase
        .from("retail_task_drafts")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        if (isDraftTableMissingError(error.message)) {
          draftTableProbe = false;
          logDraftTableUnavailable("upsertTaskDraft.update", error.message);
          return { draft: null, autosave_available: false, skipped: true };
        }
        throw new Error(error.message ?? "Could not update draft");
      }
      if (!data) throw new Error("Could not update draft");
      return {
        draft: normalizeDraft(data as Record<string, unknown>),
        autosave_available: true,
      };
    }

    const { data, error } = await supabase
      .from("retail_task_drafts")
      .insert({ ...payload, created_at: now })
      .select("*")
      .single();
    if (error) {
      if (isDraftTableMissingError(error.message)) {
        draftTableProbe = false;
        logDraftTableUnavailable("upsertTaskDraft.insert", error.message);
        return { draft: null, autosave_available: false, skipped: true };
      }
      throw new Error(error.message ?? "Could not create draft");
    }
    if (!data) throw new Error("Could not create draft");
    return {
      draft: normalizeDraft(data as Record<string, unknown>),
      autosave_available: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDraftTableMissingError(message)) {
      draftTableProbe = false;
      logDraftTableUnavailable("upsertTaskDraft", message);
      return { draft: null, autosave_available: false, skipped: true };
    }
    throw error;
  }
}

export async function appendPhotoToTaskDraft(
  supabase: Supabase,
  params: {
    task_id: string;
    staff_id: string;
    photo: TaskProofPhotoRecord;
  },
): Promise<DraftWriteResult> {
  if (!(await isTaskDraftAutosaveAvailable(supabase))) {
    return { draft: null, autosave_available: false, skipped: true };
  }

  const existing = await getTaskDraft(supabase, params.task_id, params.staff_id);
  const photos = [...(existing?.photo_urls ?? []), params.photo];
  return upsertTaskDraft(supabase, {
    task_id: params.task_id,
    staff_id: params.staff_id,
    photo_urls: photos,
    checklist_completed: existing?.checklist_completed ?? null,
    comment: existing?.comment ?? null,
  });
}

export async function deleteTaskDraft(
  supabase: Supabase,
  taskId: string,
  staffId: string,
): Promise<void> {
  if (!(await isTaskDraftAutosaveAvailable(supabase))) {
    return;
  }

  try {
    const { error } = await supabase
      .from("retail_task_drafts")
      .delete()
      .eq("task_id", taskId)
      .eq("staff_id", staffId);
    if (error) {
      if (isDraftTableMissingError(error.message)) {
        draftTableProbe = false;
        logDraftTableUnavailable("deleteTaskDraft", error.message);
        return;
      }
      throw new Error(error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDraftTableMissingError(message)) {
      draftTableProbe = false;
      logDraftTableUnavailable("deleteTaskDraft", message);
      return;
    }
    throw error;
  }
}
