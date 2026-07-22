import {
  canAccessShop,
  hasPermission,
  type StaffPermissionProfile,
} from "@/lib/permissions/resolve";
import type { RetailTaskRow } from "@/lib/retail-tasks/types";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";

export type TaskActor =
  | { kind: "admin"; name: string; role: "company_admin" }
  | {
      kind: "staff";
      staffId: string;
      name: string;
      profile: StaffPermissionProfile;
    };

export type TaskActionFailureReason =
  | "task_already_completed"
  | "task_already_submitted"
  | "task_requires_verification"
  | "task_status_invalid"
  | "task_not_assigned_to_you"
  | "task_outside_time_window"
  | "missing_submit_permission"
  | "shop_access_denied"
  | "admin_cannot_start";

export type TaskActionDebug = {
  task_id: string;
  task_status: string;
  display_status: string;
  assigned_staff_id: string | null;
  selected_staff_id: string | null;
  shop_id: string;
  current_time: string;
  due_date: string;
  due_time: string | null;
  failure_reason: TaskActionFailureReason | null;
  action: "start" | "submit" | "save_draft" | "resume";
};

type TaskActionFields = Pick<
  RetailTaskRow,
  "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time"
>;

function buildDebug(
  task: TaskActionFields,
  actor: TaskActor,
  action: TaskActionDebug["action"],
  failure_reason: TaskActionFailureReason | null,
  now: Date,
): TaskActionDebug {
  return {
    task_id: task.id,
    task_status: task.status,
    display_status: displayTaskStatus(task.status, task.due_date, task.due_time),
    assigned_staff_id: task.assigned_staff_id,
    selected_staff_id: actor.kind === "staff" ? actor.staffId : null,
    shop_id: task.shop_id,
    current_time: now.toISOString(),
    due_date: task.due_date,
    due_time: task.due_time,
    failure_reason,
    action,
  };
}

type ExplainResult =
  | { ok: true; debug: TaskActionDebug }
  | { ok: false; reason: TaskActionFailureReason; debug: TaskActionDebug };

function explainSubmitEligibility(
  task: TaskActionFields,
  actor: TaskActor,
  now = new Date(),
  action: TaskActionDebug["action"] = "submit",
): ExplainResult {
  if (actor.kind === "admin") {
    return { ok: false, reason: "admin_cannot_start", debug: buildDebug(task, actor, action, "admin_cannot_start", now) };
  }

  if (!hasPermission(actor.profile, "tasks.submit_proof")) {
    return {
      ok: false,
      reason: "missing_submit_permission",
      debug: buildDebug(task, actor, action, "missing_submit_permission", now),
    };
  }

  if (!canAccessShop(actor.profile, task.shop_id)) {
    return { ok: false, reason: "shop_access_denied", debug: buildDebug(task, actor, action, "shop_access_denied", now) };
  }

  if (task.status === "missed") {
    return explainSubmitEligibility(task, actor, now, action);
  }

  if (task.status === "verified" || task.status === "fair" || task.status === "exception_reported") {
    return {
      ok: false,
      reason: "task_already_completed",
      debug: buildDebug(task, actor, action, "task_already_completed", now),
    };
  }

  if (task.status === "submitted") {
    return {
      ok: false,
      reason: "task_already_submitted",
      debug: buildDebug(task, actor, action, "task_already_submitted", now),
    };
  }

  if (task.assigned_staff_id && task.assigned_staff_id !== actor.staffId) {
    return {
      ok: false,
      reason: "task_not_assigned_to_you",
      debug: buildDebug(task, actor, action, "task_not_assigned_to_you", now),
    };
  }

  return { ok: true, debug: buildDebug(task, actor, action, null, now) };
}

export function explainStartTaskFailure(
  task: TaskActionFields,
  actor: TaskActor,
  now = new Date(),
): ExplainResult {
  if (actor.kind === "admin") {
    return {
      ok: false,
      reason: "admin_cannot_start",
      debug: buildDebug(task, actor, "start", "admin_cannot_start", now),
    };
  }

  if (task.status === "missed") {
    return explainSubmitEligibility(task, actor, now, "start");
  }

  if (task.status === "verified" || task.status === "fair" || task.status === "exception_reported") {
    return {
      ok: false,
      reason: "task_already_completed",
      debug: buildDebug(task, actor, "start", "task_already_completed", now),
    };
  }

  if (task.status === "submitted") {
    return {
      ok: false,
      reason: "task_already_submitted",
      debug: buildDebug(task, actor, "start", "task_already_submitted", now),
    };
  }

  if (task.status === "in_progress") {
    return {
      ok: false,
      reason: "task_status_invalid",
      debug: buildDebug(task, actor, "start", "task_status_invalid", now),
    };
  }

  if (task.status !== "pending" && task.status !== "rejected") {
    return {
      ok: false,
      reason: "task_status_invalid",
      debug: buildDebug(task, actor, "start", "task_status_invalid", now),
    };
  }

  return explainSubmitEligibility(task, actor, now, "start");
}

export function explainSubmitTaskFailure(
  task: TaskActionFields,
  actor: TaskActor,
  now = new Date(),
): ExplainResult {
  if (task.status === "missed") {
    return explainSubmitEligibility(task, actor, now, "submit");
  }

  if (task.status === "verified" || task.status === "fair" || task.status === "exception_reported") {
    return {
      ok: false,
      reason: "task_already_completed",
      debug: buildDebug(task, actor, "submit", "task_already_completed", now),
    };
  }

  if (task.status === "submitted") {
    return {
      ok: false,
      reason: "task_already_submitted",
      debug: buildDebug(task, actor, "submit", "task_already_submitted", now),
    };
  }

  if (!["pending", "in_progress", "rejected", "missed"].includes(task.status)) {
    return {
      ok: false,
      reason: "task_status_invalid",
      debug: buildDebug(task, actor, "submit", "task_status_invalid", now),
    };
  }

  return explainSubmitEligibility(task, actor, now, "submit");
}

export function explainSaveDraftFailure(
  task: TaskActionFields,
  actor: TaskActor,
  now = new Date(),
): ExplainResult {
  if (task.status !== "in_progress") {
    return {
      ok: false,
      reason: "task_status_invalid",
      debug: buildDebug(task, actor, "save_draft", "task_status_invalid", now),
    };
  }

  return explainSubmitEligibility(task, actor, now, "save_draft");
}

export function logTaskActionFailure(debug: TaskActionDebug): void {
  console.warn("[task-action] blocked", debug);
}

/** DB statuses where staff can still work. Overdue is display-only, not a lock. */
export function isStaffWorkableStatus(status: string): boolean {
  return (
    status === "pending" || status === "in_progress" || status === "rejected" || status === "missed"
  );
}

export function canAdminManageTasks(actor: TaskActor): boolean {
  return actor.kind === "admin";
}

export function canViewTask(
  task: Pick<RetailTaskRow, "shop_id" | "assigned_staff_id" | "verifier_staff_id">,
  actor: TaskActor,
): boolean {
  if (actor.kind === "admin") return true;
  const { profile } = actor;
  if (!canAccessShop(profile, task.shop_id)) return false;
  if (task.assigned_staff_id === actor.staffId) return hasPermission(profile, "tasks.view_own");
  if (task.verifier_staff_id === actor.staffId) return true;
  if (hasPermission(profile, "tasks.view_shop")) return true;
  if (!task.assigned_staff_id && hasPermission(profile, "tasks.submit_proof")) return true;
  return false;
}

export function canSubmitTask(
  task: Pick<RetailTaskRow, "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time">,
  actor: TaskActor,
): boolean {
  return explainSubmitTaskFailure(task, actor).ok;
}

export function canVerifyTask(
  task: Pick<RetailTaskRow, "verifier_staff_id" | "status" | "shop_id">,
  actor: TaskActor,
): boolean {
  if (task.status !== "submitted") return false;
  if (actor.kind === "admin") return true;
  const canVerify =
    hasPermission(actor.profile, "tasks.verify_proof") ||
    hasPermission(actor.profile, "tasks.approve");
  if (!canVerify) return false;
  if (!canAccessShop(actor.profile, task.shop_id)) return false;
  if (task.verifier_staff_id && task.verifier_staff_id !== actor.staffId) return false;
  return true;
}

export function canReportException(
  task: Pick<RetailTaskRow, "shop_id" | "assigned_staff_id" | "feedback_allowed" | "status">,
  actor: TaskActor,
): boolean {
  if (!task.feedback_allowed) return false;
  if (task.status === "verified" || task.status === "fair") return false;
  if (actor.kind === "admin") return true;
  if (!hasPermission(actor.profile, "tasks.exception_submit")) return false;
  if (!canAccessShop(actor.profile, task.shop_id)) return false;
  if (task.assigned_staff_id && task.assigned_staff_id !== actor.staffId) {
    return hasPermission(actor.profile, "tasks.exception_review");
  }
  return true;
}

export function canStartTask(
  task: Pick<RetailTaskRow, "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time">,
  actor: TaskActor,
): boolean {
  return explainStartTaskFailure(task, actor).ok;
}

export function canSaveTaskDraft(
  task: Pick<RetailTaskRow, "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time">,
  actor: TaskActor,
): boolean {
  return explainSaveDraftFailure(task, actor).ok;
}

export function canResumeTask(
  task: Pick<RetailTaskRow, "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time">,
  actor: TaskActor,
): boolean {
  return canSaveTaskDraft(task, actor);
}
