import { NextResponse } from "next/server";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import { ensureStaffPermissionProfile } from "@/lib/permissions/staff-permissions-db";
import { getRetailTaskById } from "@/lib/retail-tasks/retail-tasks-db";
import { getTaskDraft, isTaskDraftAutosaveAvailable, upsertTaskDraft } from "@/lib/retail-tasks/task-draft-db";
import { normalizePhotoRecords, taskProofDisplayPath } from "@/lib/retail-tasks/task-proof-photos";
import { TASK_PROOF_BUCKET } from "@/lib/retail-tasks/task-photo-storage";
import { canSaveTaskDraft, canViewTask, type TaskActor } from "@/lib/retail-tasks/task-permissions";
import type { TaskProofPhotoRecord } from "@/lib/retail-tasks/types";
import { createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SEC = 3600;

async function staffActor(
  supabase: ReturnType<typeof createAdminClient>,
  shopId: string,
  staffId: string,
  companyId: string,
): Promise<TaskActor | NextResponse> {
  const staffResult = await validateStaffForPunch(supabase, shopId, { staffId });
  if ("error" in staffResult) {
    return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
  }
  const profile = await ensureStaffPermissionProfile(supabase, {
    company_id: companyId,
    staff_id: staffId,
  });
  return {
    kind: "staff",
    staffId,
    name: staffResult.staff.staff_name,
    profile,
  };
}

async function signPhotoPreviews(
  supabase: ReturnType<typeof createAdminClient>,
  photos: TaskProofPhotoRecord[],
): Promise<Array<TaskProofPhotoRecord & { preview_url: string | null }>> {
  return Promise.all(
    photos.map(async (photo) => {
      const path = taskProofDisplayPath(photo);
      const { data } = await supabase.storage
        .from(TASK_PROOF_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SEC);
      return { ...photo, preview_url: data?.signedUrl ?? null };
    }),
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shopId: string; taskId: string }> },
) {
  const { shopId, taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const shopResult = await loadShopForPunch(supabase, shopId);
    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if (!shopResult.shop.companyId) {
      return NextResponse.json({ error: "Shop company not configured" }, { status: 400 });
    }

    const staffId = new URL(req.url).searchParams.get("staff_id")?.trim();
    if (!staffId) return NextResponse.json({ error: "staff_id is required" }, { status: 400 });

    const actor = await staffActor(supabase, shopId, staffId, shopResult.shop.companyId);
    if (actor instanceof NextResponse) return actor;

    const task = await getRetailTaskById(supabase, taskId);
    if (!task || task.shop_id !== shopId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!canViewTask(task, actor)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const autosave_available = await isTaskDraftAutosaveAvailable(supabase);
    if (!autosave_available) {
      return NextResponse.json({ draft: null, autosave_available: false });
    }

    const draft = await getTaskDraft(supabase, taskId, staffId);
    if (!draft) {
      return NextResponse.json({ draft: null, autosave_available: true });
    }

    const photos = await signPhotoPreviews(supabase, draft.photo_urls);
    return NextResponse.json({
      draft: {
        ...draft,
        photo_urls: photos,
      },
      autosave_available: true,
    });
  } catch (e) {
    console.error("[task-draft] GET failed", e);
    return NextResponse.json({ draft: null, autosave_available: false });
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ shopId: string; taskId: string }> },
) {
  const { shopId, taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const shopResult = await loadShopForPunch(supabase, shopId);
    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if (!shopResult.shop.companyId) {
      return NextResponse.json({ error: "Shop company not configured" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const staffId = String(body.staff_id ?? "").trim();
    if (!staffId) return NextResponse.json({ error: "staff_id is required" }, { status: 400 });

    const actor = await staffActor(supabase, shopId, staffId, shopResult.shop.companyId);
    if (actor instanceof NextResponse) return actor;

    const task = await getRetailTaskById(supabase, taskId);
    if (!task || task.shop_id !== shopId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!canSaveTaskDraft(task, actor)) {
      return NextResponse.json({ error: "Task is not in progress" }, { status: 403 });
    }

    const patch: {
      task_id: string;
      staff_id: string;
      photo_urls?: TaskProofPhotoRecord[];
      checklist_completed?: Record<string, boolean> | null;
      comment?: string | null;
    } = { task_id: taskId, staff_id: staffId };

    if (body.photo_urls != null) {
      patch.photo_urls = normalizePhotoRecords(body.photo_urls);
    }
    if (body.checklist != null && typeof body.checklist === "object" && !Array.isArray(body.checklist)) {
      patch.checklist_completed = body.checklist as Record<string, boolean>;
    } else if (body.checklist_completed != null) {
      patch.checklist_completed = body.checklist_completed as Record<string, boolean>;
    }
    if (body.comment !== undefined) {
      patch.comment = body.comment != null ? String(body.comment) : null;
    }

    const writeResult = await upsertTaskDraft(supabase, patch);
    if (!writeResult.autosave_available) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        autosave_available: false,
        draft: null,
      });
    }
    return NextResponse.json({ ok: true, draft: writeResult.draft, autosave_available: true });
  } catch (e) {
    console.error("[task-draft] PUT failed", e);
    return NextResponse.json({
      ok: true,
      skipped: true,
      autosave_available: false,
      draft: null,
    });
  }
}
