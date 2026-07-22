import { NextResponse } from "next/server";
import {
  explainSaveDraftFailure,
  explainStartTaskFailure,
  explainSubmitTaskFailure,
  logTaskActionFailure,
  type TaskActionFailureReason,
} from "@/lib/retail-tasks/task-permissions";

const FAILURE_MESSAGES: Record<TaskActionFailureReason, string> = {
  task_already_completed: "Task already completed",
  task_already_submitted: "Task already submitted",
  task_requires_verification: "Task requires verification",
  task_status_invalid: "Task status invalid",
  task_not_assigned_to_you: "Task not assigned to you",
  task_outside_time_window: "Task outside allowed time window",
  missing_submit_permission: "You do not have permission to submit tasks",
  shop_access_denied: "You do not have access to this shop",
  admin_cannot_start: "Admins cannot start tasks from the staff screen",
};

export function taskActionDeniedResponse(
  result: Extract<
    ReturnType<typeof explainStartTaskFailure>,
    { ok: false }
  >,
) {
  logTaskActionFailure(result.debug);
  return NextResponse.json(
    {
      error: FAILURE_MESSAGES[result.reason] ?? "Action not allowed",
      code: result.reason,
      debug: result.debug,
    },
    { status: 403 },
  );
}

export { explainStartTaskFailure, explainSubmitTaskFailure, explainSaveDraftFailure };
