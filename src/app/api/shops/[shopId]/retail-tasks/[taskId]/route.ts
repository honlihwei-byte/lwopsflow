import { NextResponse } from "next/server";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import {
  createTaskFeedback,
  createTaskSubmission,
  createTaskVerification,
  getLatestSubmission,
  getRetailTaskById,
  getTaskDetailBundle,
  setTaskStatus,
} from "@/lib/retail-tasks/retail-tasks-db";
import { deleteTaskDraft, getTaskDraft, upsertTaskDraft } from "@/lib/retail-tasks/task-draft-db";
import { logOpsAudit } from "@/lib/permissions/audit";
import { ensureStaffPermissionProfile } from "@/lib/permissions/staff-permissions-db";
import { logTaskActivity } from "@/lib/retail-tasks/task-activity";
import {
  canReportException,
  canVerifyTask,
  canViewTask,
  explainSaveDraftFailure,
  explainStartTaskFailure,
  explainSubmitTaskFailure,
  type TaskActor,
} from "@/lib/retail-tasks/task-permissions";
import { taskActionDeniedResponse } from "@/lib/retail-tasks/task-action-errors";
import { normalizePhotoRecords } from "@/lib/retail-tasks/task-proof-photos";
import { validateTaskSubmission } from "@/lib/retail-tasks/task-submission-rules";
import { verifyTaskGps } from "@/lib/retail-tasks/task-gps";
import { notifyStaffTask } from "@/lib/retail-tasks/task-notifications";
import { applyTaskReview, parseTaskReviewDecision } from "@/lib/retail-tasks/task-review";
import { FEEDBACK_REASON_TYPES } from "@/lib/retail-tasks/types";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const url = new URL(req.url);
    const staffId = url.searchParams.get("staff_id")?.trim();
    if (!staffId) return NextResponse.json({ error: "staff_id is required" }, { status: 400 });

    const actor = await staffActor(supabase, shopId, staffId, shopResult.shop.companyId);
    if (actor instanceof NextResponse) return actor;

    const bundle = await getTaskDetailBundle(supabase, taskId);
    if (!bundle || bundle.task.shop_id !== shopId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!canViewTask(bundle.task, actor)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(bundle);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(
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
    const companyId = shopResult.shop.companyId;

    const body = (await req.json()) as Record<string, unknown>;
    const staffId = String(body.staff_id ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!staffId) return NextResponse.json({ error: "staff_id is required" }, { status: 400 });

    const actor = await staffActor(supabase, shopId, staffId, companyId);
    if (actor instanceof NextResponse) return actor;
    if (actor.kind !== "staff") return NextResponse.json({ error: "Invalid actor" }, { status: 400 });

    const task = await getRetailTaskById(supabase, taskId);
    if (!task || task.shop_id !== shopId || task.company_id !== companyId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!canViewTask(task, actor)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (action === "start") {
      const startCheck = explainStartTaskFailure(task, actor);
      if (!startCheck.ok) {
        return taskActionDeniedResponse(startCheck);
      }
      const updated = await setTaskStatus(
        supabase,
        taskId,
        "in_progress",
        { id: staffId, name: actor.name, role: actor.profile.role_template },
        "started",
        undefined,
        { started_at: new Date().toISOString(), started_by: staffId },
      );
      const existingDraft = await getTaskDraft(supabase, taskId, staffId);
      if (!existingDraft) {
        await upsertTaskDraft(supabase, {
          task_id: taskId,
          staff_id: staffId,
          photo_urls: [],
          checklist_completed: null,
          comment: null,
        });
      }
      return NextResponse.json({ ok: true, task: updated });
    }

    if (action === "save_draft") {
      const draftCheck = explainSaveDraftFailure(task, actor);
      if (!draftCheck.ok) {
        return taskActionDeniedResponse(draftCheck);
      }
      const checklist =
        body.checklist != null && typeof body.checklist === "object" && !Array.isArray(body.checklist)
          ? (body.checklist as Record<string, boolean>)
          : undefined;
      const draftResult = await upsertTaskDraft(supabase, {
        task_id: taskId,
        staff_id: staffId,
        photo_urls:
          body.photo_urls != null ? normalizePhotoRecords(body.photo_urls) : undefined,
        checklist_completed: checklist ?? undefined,
        comment: body.comment !== undefined ? String(body.comment ?? "") : undefined,
      });
      return NextResponse.json({
        ok: true,
        draft: draftResult.draft,
        autosave_available: draftResult.autosave_available,
        skipped: draftResult.skipped ?? false,
      });
    }

    if (action === "submit") {
      const submitCheck = explainSubmitTaskFailure(task, actor);
      if (!submitCheck.ok) {
        return taskActionDeniedResponse(submitCheck);
      }

      const submissionCheck = validateTaskSubmission(task, body);
      if (!submissionCheck.ok) {
        return NextResponse.json(
          { error: submissionCheck.error, code: submissionCheck.code },
          { status: 400 },
        );
      }

      let gpsFields: {
        gps_lat?: number | null;
        gps_lng?: number | null;
        gps_distance_meters?: number | null;
        gps_status?: string | null;
      } = {};

      if (task.gps_required) {
        const gps = await verifyTaskGps(supabase, shopId, body, { task_id: taskId });
        if ("error" in gps) {
          return NextResponse.json(
            { error: gps.error, code: gps.code ?? "gps_required" },
            { status: 400 },
          );
        }
        gpsFields = gps;
      }

      const submission = await createTaskSubmission(supabase, {
        task_id: taskId,
        submitted_by: staffId,
        photo_urls: submissionCheck.photo_urls,
        checklist_completed: submissionCheck.checklist,
        comment: body.comment ? String(body.comment) : null,
        overdue_reason: submissionCheck.overdue_reason,
        ...gpsFields,
      });

      if (submissionCheck.photo_urls.length > 0) {
        await logTaskActivity(supabase, {
          task_id: taskId,
          actor_id: staffId,
          actor_name: actor.name,
          actor_role: actor.profile.role_template,
          action_type: "photo_uploaded",
          note: `${submissionCheck.photo_urls.length} photo(s) attached`,
        });
      }

      const updated = await setTaskStatus(
        supabase,
        taskId,
        "submitted",
        { id: staffId, name: actor.name, role: actor.profile.role_template },
        "submitted",
        body.comment ? String(body.comment) : undefined,
      );

      if (task.verifier_staff_id) {
        await notifyStaffTask(supabase, {
          company_id: task.company_id,
          staff_id: task.verifier_staff_id,
          shop_id: shopId,
          notification_type: "task_submitted",
          title: "Task awaiting verification",
          body: task.title,
        });
      }

      await deleteTaskDraft(supabase, taskId, staffId);

      return NextResponse.json({ ok: true, task: updated, submission });
    }

    if (action === "verify") {
      if (!canVerifyTask(task, actor)) {
        return NextResponse.json(
          { error: "You do not have permission to review this task." },
          { status: 403 },
        );
      }
      const decision = parseTaskReviewDecision(body.decision);
      if (!decision) {
        return NextResponse.json(
          { error: "decision must be accepted, fair, or rejected" },
          { status: 400 },
        );
      }
      const manager_feedback = String(
        body.manager_feedback ?? body.rejection_reason ?? "",
      ).trim();
      if (decision === "rejected" && !manager_feedback) {
        return NextResponse.json({ error: "manager_feedback is required when rejecting" }, { status: 400 });
      }

      const updated = await applyTaskReview(supabase, {
        task,
        shopId,
        verifierId: staffId,
        verifierName: actor.name,
        verifierRole: actor.profile.role_template,
        decision,
        manager_feedback: manager_feedback || null,
      });

      return NextResponse.json({ ok: true, task: updated });
    }

    if (action === "exception") {
      if (!canReportException(task, actor)) {
        return NextResponse.json({ error: "Cannot report exception" }, { status: 403 });
      }
      const reason_type = String(body.reason_type ?? "").trim();
      const reason_text = String(body.reason_text ?? "").trim();
      if (!FEEDBACK_REASON_TYPES.includes(reason_type as (typeof FEEDBACK_REASON_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid reason_type" }, { status: 400 });
      }
      if (!reason_text) {
        return NextResponse.json({ error: "reason_text is required" }, { status: 400 });
      }

      await createTaskFeedback(supabase, {
        task_id: taskId,
        submitted_by: staffId,
        reason_type,
        reason_text,
        photo_url: body.photo_url ? String(body.photo_url) : null,
        shop_id: shopId,
        actor_role: actor.profile.role_template,
      });

      await logOpsAudit(supabase, {
        company_id: companyId,
        actor_type: "staff",
        actor_id: staffId,
        actor_name: actor.name,
        target_type: "task",
        target_id: taskId,
        action: "feedback_submitted",
        new_value: { reason_type, reason_text },
      });

      const updated = await setTaskStatus(
        supabase,
        taskId,
        "exception_reported",
        { id: staffId, name: actor.name, role: actor.profile.role_template },
        "exception_reported",
        reason_text,
      );

      return NextResponse.json({ ok: true, task: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
