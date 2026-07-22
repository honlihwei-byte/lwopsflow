import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { notifyTaskAssigned } from "@/lib/notifications/task-assigned-notify";
import { loadTaskSeriesNotificationSettings } from "@/lib/notifications/task-series-db";
import { deleteRetailTaskWithScope } from "@/lib/retail-tasks/task-delete";
import type { TaskDeleteScope } from "@/lib/retail-tasks/task-kind";
import { getTaskDetailBundle, updateRetailTask } from "@/lib/retail-tasks/retail-tasks-db";
import { normalizeChecklistItems } from "@/lib/retail-tasks/task-checklist";
import { PHOTO_CAPTURE_MODES, TASK_CATEGORIES, TASK_PRIORITIES, TASK_REPEAT_TYPES } from "@/lib/retail-tasks/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const bundle = await getTaskDetailBundle(supabase, taskId);
    if (!bundle || bundle.task.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const bundle = await getTaskDetailBundle(supabase, taskId);
    if (!bundle || bundle.task.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.title != null) patch.title = String(body.title).trim();
    if (body.description != null) patch.description = String(body.description);
    if (body.category != null) {
      const cat = String(body.category);
      if (!TASK_CATEGORIES.includes(cat as (typeof TASK_CATEGORIES)[number])) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      patch.category = cat;
    }
    if (body.priority != null) {
      const p = String(body.priority);
      if (!TASK_PRIORITIES.includes(p as (typeof TASK_PRIORITIES)[number])) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      patch.priority = p;
    }
    if (body.repeat_type != null) {
      const r = String(body.repeat_type);
      if (!TASK_REPEAT_TYPES.includes(r as (typeof TASK_REPEAT_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid repeat_type" }, { status: 400 });
      }
      patch.repeat_type = r;
    }
    if (body.due_date != null) patch.due_date = String(body.due_date);
    if (body.due_time != null) patch.due_time = String(body.due_time).slice(0, 5);
    const prevAssignedStaffId = bundle.task.assigned_staff_id;
    if (body.assigned_staff_id !== undefined) {
      patch.assigned_staff_id = body.assigned_staff_id ? String(body.assigned_staff_id) : null;
    }
    if (body.verifier_staff_id !== undefined) {
      patch.verifier_staff_id = body.verifier_staff_id ? String(body.verifier_staff_id) : null;
    }
    if (body.photo_required != null) patch.photo_required = body.photo_required === true;
    if (body.min_photos != null) {
      patch.min_photos = Math.max(0, Number(body.min_photos) || 0);
      patch.photo_required = (patch.min_photos as number) > 0;
    }
    if (body.photo_capture_mode != null) {
      const mode = String(body.photo_capture_mode);
      if (!PHOTO_CAPTURE_MODES.includes(mode as (typeof PHOTO_CAPTURE_MODES)[number])) {
        return NextResponse.json({ error: "Invalid photo_capture_mode" }, { status: 400 });
      }
      patch.photo_capture_mode = mode;
    }
    if (body.checklist_items != null) {
      patch.checklist_items = normalizeChecklistItems(body.checklist_items);
    }
    if (body.gps_required != null) patch.gps_required = body.gps_required === true;
    if (body.feedback_allowed != null) patch.feedback_allowed = body.feedback_allowed !== false;

    const task = await updateRetailTask(supabase, taskId, patch, {
      name: scope.session.companyName ?? "Admin",
      role: "company_admin",
    });

    if (body.assigned_staff_id !== undefined) {
      const nextAssigned = task.assigned_staff_id;
      if (nextAssigned !== prevAssignedStaffId) {
        const settings = await loadTaskSeriesNotificationSettings(supabase, task.series_id);
        void notifyTaskAssigned(supabase, task, settings).catch((e) => {
          console.warn("[retail-tasks] reassignment notification failed", task.id, e);
        });
      }
    }

    return NextResponse.json({ ok: true, task });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const access = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(access)) return access;

    const bundle = await getTaskDetailBundle(supabase, taskId);
    if (!bundle || bundle.task.company_id !== access.companyId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let deleteScope: TaskDeleteScope = "occurrence";
    try {
      const body = (await req.json()) as { scope?: string };
      if (body.scope === "future") deleteScope = "future";
    } catch {
      // Empty body: default to single occurrence delete.
    }

    const result = await deleteRetailTaskWithScope(supabase, taskId, deleteScope, {
      name: access.session.companyName ?? "Admin",
      role: "company_admin",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
