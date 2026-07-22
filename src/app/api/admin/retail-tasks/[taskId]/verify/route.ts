import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { getRetailTaskById } from "@/lib/retail-tasks/retail-tasks-db";
import { applyTaskReview, parseTaskReviewDecision } from "@/lib/retail-tasks/task-review";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const task = await getRetailTaskById(supabase, taskId);
    if (!task || task.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.status !== "submitted") {
      return NextResponse.json({ error: "Task is not awaiting verification" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
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

    // Company admins / area managers may review even when no staff verifier is
    // appointed. Attribute the verification to the configured verifier/assignee
    // when one exists; otherwise record it without a staff verifier_id.
    const verifierStaffId = task.verifier_staff_id ?? task.assigned_staff_id ?? null;

    const updated = await applyTaskReview(supabase, {
      task,
      shopId: task.shop_id,
      verifierId: verifierStaffId,
      verifierName: scope.session.companyName ?? "Admin",
      verifierRole: "company_admin",
      decision,
      manager_feedback: manager_feedback || null,
    });

    return NextResponse.json({ ok: true, task: updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
