import type {
  RetailTaskRow,
  RetailTaskSubmissionRow,
  TaskChecklistItem,
  TaskReviewDecision,
} from "@/lib/retail-tasks/types";

/** Hours after due time still counted as "within grace period". @deprecated use minute tiers */
export const TASK_TIMELINESS_GRACE_HOURS = 2;

/** Hours after due time before submission is "very late". @deprecated use minute tiers */
export const TASK_TIMELINESS_VERY_LATE_HOURS = 24;

export const TASK_SCORE_WEIGHTS = {
  systemMax: 70,
  managerMax: 20,
  consistencyMax: 10,
} as const;

export const MANAGER_REVIEW_POINTS: Record<TaskReviewDecision, number> = {
  accepted: 20,
  fair: 10,
  rejected: 0,
};

export type TaskScoreComponent = {
  earned: number;
  max: number;
  label: string;
  detail?: string;
};

export type TaskScoreBreakdown = {
  completion: TaskScoreComponent;
  timeliness: TaskScoreComponent;
  checklist: TaskScoreComponent;
  photos: TaskScoreComponent;
  manager_review: TaskScoreComponent;
  consistency: TaskScoreComponent;
  system_score: number;
  manager_score: number;
  consistency_bonus: number;
  final_score: number;
};

export type StaffConsistencyContext = {
  consecutive_completed: number;
  missed_tasks_last_30_days: number;
  completion_rate_last_30_days: number | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Malaysia-local due instant from task due_date + due_time. */
export function taskDueInstant(
  dueDate: string,
  dueTime: string | null,
): Date {
  const timePart = dueTime ? String(dueTime).slice(0, 5) : "23:59";
  return new Date(`${dueDate}T${timePart}:00+08:00`);
}

export type TimelinessTier =
  | "before_due"
  | "within_30"
  | "within_120"
  | "very_late"
  | "not_submitted";

export function classifyTimeliness(
  submittedAt: string | null | undefined,
  dueDate: string,
  dueTime: string | null,
): TimelinessTier {
  if (!submittedAt) return "not_submitted";
  const due = taskDueInstant(dueDate, dueTime);
  const submitted = new Date(submittedAt);
  if (submitted.getTime() <= due.getTime()) return "before_due";

  const minutesLate = Math.max(
    0,
    Math.round((submitted.getTime() - due.getTime()) / 60_000),
  );
  if (minutesLate <= 30) return "within_30";
  if (minutesLate <= 120) return "within_120";
  return "very_late";
}

/** Timeliness score out of 100 (not the composite task score). */
export function timelinessScorePercent(
  submittedAt: string | null | undefined,
  dueDate: string,
  dueTime: string | null,
): number {
  const tier = classifyTimeliness(submittedAt, dueDate, dueTime);
  return TIMELINESS_SCORE_PERCENT[tier];
}

const TIMELINESS_SCORE_PERCENT: Record<TimelinessTier, number> = {
  before_due: 100,
  within_30: 90,
  within_120: 75,
  very_late: 50,
  not_submitted: 0,
};

const TIMELINESS_POINTS: Record<TimelinessTier, number> = {
  before_due: 20,
  within_30: 18,
  within_120: 15,
  very_late: 10,
  not_submitted: 0,
};

const TIMELINESS_LABELS: Record<TimelinessTier, string> = {
  before_due: "Completed before due time (100%)",
  within_30: "Completed within 30 minutes late (90%)",
  within_120: "Completed 31–120 minutes late (75%)",
  very_late: "Completed more than 120 minutes late (50%)",
  not_submitted: "Not completed (0%)",
};

export function scoreChecklist(
  items: TaskChecklistItem[],
  completed: Record<string, boolean> | null | undefined,
): { earned: number; max: number; detail: string } {
  const max = 15;
  if (items.length === 0) {
    return { earned: max, max, detail: "No checklist required" };
  }
  const required = items.filter((i) => i.required);
  const target = required.length > 0 ? required : items;
  if (target.length === 0) {
    return { earned: max, max, detail: "No checklist items" };
  }
  const done = target.filter((i) => completed?.[i.id] === true).length;
  const ratio = done / target.length;
  const earned = Math.round(max * ratio);
  return {
    earned,
    max,
    detail: `${done} of ${target.length} checklist items completed`,
  };
}

export function scorePhotos(
  task: Pick<RetailTaskRow, "photo_required" | "min_photos">,
  submission: Pick<RetailTaskSubmissionRow, "photo_urls"> | null | undefined,
): { earned: number; max: number; detail: string } {
  const max = 15;
  const minRequired = task.photo_required ? Math.max(1, task.min_photos) : 0;
  if (minRequired === 0) {
    return { earned: max, max, detail: "No photos required" };
  }
  const count = submission?.photo_urls?.length ?? 0;
  if (count === 0) {
    return { earned: 0, max, detail: "No photos submitted" };
  }
  const ratio = Math.min(1, count / minRequired);
  const earned = Math.round(max * ratio);
  return {
    earned,
    max,
    detail: `${count} of ${minRequired} required photo(s) submitted`,
  };
}

export function computeConsistencyBonus(ctx: StaffConsistencyContext): {
  bonus: number;
  detail: string;
} {
  let bonus = 0;
  const parts: string[] = [];

  if (ctx.consecutive_completed >= 7) {
    bonus += 5;
    parts.push(`${ctx.consecutive_completed}-task completion streak (+5)`);
  }

  if (ctx.missed_tasks_last_30_days === 0 && ctx.consecutive_completed > 0) {
    bonus += 5;
    parts.push("No missed tasks in 30 days (+5)");
  }

  if (
    ctx.completion_rate_last_30_days != null &&
    ctx.completion_rate_last_30_days >= 0.9 &&
    bonus < TASK_SCORE_WEIGHTS.consistencyMax
  ) {
    const trendBonus = 2;
    bonus += trendBonus;
    parts.push(`High completion trend ${Math.round(ctx.completion_rate_last_30_days * 100)}% (+${trendBonus})`);
  }

  bonus = clamp(bonus, 0, TASK_SCORE_WEIGHTS.consistencyMax);

  return {
    bonus,
    detail: parts.length > 0 ? parts.join("; ") : "No consistency bonus this task",
  };
}

export function computeSystemScore(params: {
  task: Pick<
    RetailTaskRow,
    "due_date" | "due_time" | "photo_required" | "min_photos" | "checklist_items"
  >;
  submission: RetailTaskSubmissionRow | null | undefined;
}): {
  completion: TaskScoreComponent;
  timeliness: TaskScoreComponent;
  checklist: TaskScoreComponent;
  photos: TaskScoreComponent;
  system_score: number;
} {
  const submitted = Boolean(params.submission);
  const completionEarned = submitted ? 40 : 0;

  const timelinessTier = classifyTimeliness(
    params.submission?.submitted_at,
    params.task.due_date,
    params.task.due_time,
  );
  const timelinessEarned = submitted ? TIMELINESS_POINTS[timelinessTier] : 0;

  const checklist = scoreChecklist(
    params.task.checklist_items ?? [],
    params.submission?.checklist_completed,
  );
  const photos = scorePhotos(params.task, params.submission);

  const system_score = completionEarned + timelinessEarned + checklist.earned + photos.earned;

  return {
    completion: {
      earned: completionEarned,
      max: 40,
      label: "Task Completion",
      detail: submitted ? "Task submitted" : "Task not submitted",
    },
    timeliness: {
      earned: timelinessEarned,
      max: 20,
      label: "On-Time Completion",
      detail: `${TIMELINESS_LABELS[timelinessTier]} — ${timelinessScorePercent(params.submission?.submitted_at, params.task.due_date, params.task.due_time)}%`,
    },
    checklist: {
      earned: checklist.earned,
      max: checklist.max,
      label: "Checklist Completion",
      detail: checklist.detail,
    },
    photos: {
      earned: photos.earned,
      max: photos.max,
      label: "Required Photos",
      detail: photos.detail,
    },
    system_score,
  };
}

export function computeTaskScore(params: {
  task: Pick<
    RetailTaskRow,
    "due_date" | "due_time" | "photo_required" | "min_photos" | "checklist_items"
  >;
  submission: RetailTaskSubmissionRow | null | undefined;
  decision: TaskReviewDecision;
  consistency: StaffConsistencyContext;
}): TaskScoreBreakdown {
  const system = computeSystemScore(params);
  const manager_score = MANAGER_REVIEW_POINTS[params.decision];
  const consistencyResult = computeConsistencyBonus(params.consistency);

  const final_score = clamp(
    system.system_score + manager_score + consistencyResult.bonus,
    0,
    100,
  );

  const managerLabels: Record<TaskReviewDecision, string> = {
    accepted: "Manager accepted",
    fair: "Manager marked fair / needs improvement",
    rejected: "Manager rejected",
  };

  return {
    completion: system.completion,
    timeliness: system.timeliness,
    checklist: system.checklist,
    photos: system.photos,
    manager_review: {
      earned: manager_score,
      max: TASK_SCORE_WEIGHTS.managerMax,
      label: "Manager Review",
      detail: managerLabels[params.decision],
    },
    consistency: {
      earned: consistencyResult.bonus,
      max: TASK_SCORE_WEIGHTS.consistencyMax,
      label: "Consistency Bonus",
      detail: consistencyResult.detail,
    },
    system_score: system.system_score,
    manager_score,
    consistency_bonus: consistencyResult.bonus,
    final_score,
  };
}

/** Average final task score for reliability integration (0–100). */
export function averageFinalTaskScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round(sum / scores.length);
}
