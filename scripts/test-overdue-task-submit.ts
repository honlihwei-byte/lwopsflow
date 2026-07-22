/**
 * Run: npx --yes tsx scripts/test-overdue-task-submit.ts
 */
import { isStaffWorkableStatus } from "../src/lib/retail-tasks/task-permissions";
import { resolveDisplayTaskStatus, minutesLate, formatOverdueDuration } from "../src/lib/retail-tasks/task-overdue";
import {
  classifyTimeliness,
  timelinessScorePercent,
} from "../src/lib/retail-tasks/task-scoring";
import { validateTaskSubmission } from "../src/lib/retail-tasks/task-submission-rules";
import type { RetailTaskRow } from "../src/lib/retail-tasks/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const task: Pick<
  RetailTaskRow,
  "id" | "shop_id" | "assigned_staff_id" | "status" | "due_date" | "due_time" | "min_photos" | "photo_required" | "checklist_items"
> = {
  id: "t1",
  shop_id: "shop",
  assigned_staff_id: "staff-1",
  status: "pending",
  due_date: "2026-06-10",
  due_time: "09:00",
  min_photos: 0,
  photo_required: false,
  checklist_items: [],
};

const actor = {
  kind: "staff" as const,
  staffId: "staff-1",
  name: "Test",
  profile: {
    staff_id: "staff-1",
    company_id: "co",
    role_template: "staff",
    shop_scope: "selected_shops",
    permissions: ["tasks.submit_proof", "tasks.view_own"],
    shop_ids: ["shop"],
  },
};

const now = new Date("2026-06-10T10:00:00+08:00");

assert(isStaffWorkableStatus("pending"), "pending is workable");
assert(isStaffWorkableStatus("missed"), "missed is workable for overdue recovery");

const missingReason = validateTaskSubmission(task, {}, now);
assert(!missingReason.ok && missingReason.code === "overdue_reason_required", "requires overdue reason");

const withReason = validateTaskSubmission(task, { overdue_reason: "Traffic delay" }, now);
assert(withReason.ok && withReason.overdue_reason === "Traffic delay", "accepts overdue reason");

const onTime = new Date("2026-06-10T08:30:00+08:00");
const ignoresReasonWhenOnTime = validateTaskSubmission(
  task,
  { overdue_reason: "Should not be stored" },
  onTime,
);
assert(
  ignoresReasonWhenOnTime.ok && ignoresReasonWhenOnTime.overdue_reason === null,
  "clears overdue reason when not overdue",
);

assert(
  resolveDisplayTaskStatus({
    status: "pending",
    due_date: task.due_date,
    due_time: task.due_time,
  }) === "overdue",
  "display overdue before submit",
);

assert(
  resolveDisplayTaskStatus({
    status: "submitted",
    due_date: task.due_date,
    due_time: task.due_time,
    submitted_at: "2026-06-10T10:15:00+08:00",
  }) === "submitted_late",
  "display submitted_late after late submit",
);

assert(classifyTimeliness("2026-06-10T08:59:00+08:00", task.due_date, task.due_time) === "before_due", "before due");
assert(classifyTimeliness("2026-06-10T09:20:00+08:00", task.due_date, task.due_time) === "within_30", "within 30");
assert(classifyTimeliness("2026-06-10T10:30:00+08:00", task.due_date, task.due_time) === "within_120", "within 120");
assert(classifyTimeliness("2026-06-10T13:00:00+08:00", task.due_date, task.due_time) === "very_late", "very late");

assert(timelinessScorePercent("2026-06-10T08:59:00+08:00", task.due_date, task.due_time) === 100, "score 100");
assert(timelinessScorePercent("2026-06-10T09:20:00+08:00", task.due_date, task.due_time) === 90, "score 90");
assert(timelinessScorePercent("2026-06-10T10:30:00+08:00", task.due_date, task.due_time) === 75, "score 75");
assert(timelinessScorePercent("2026-06-10T13:00:00+08:00", task.due_date, task.due_time) === 50, "score 50");

assert(minutesLate("2026-06-10T10:30:00+08:00", task.due_date, task.due_time) === 90, "90 min late");
assert(formatOverdueDuration(90) === "1h 30m", "format duration");

console.log("✓ overdue task submission tests passed");
