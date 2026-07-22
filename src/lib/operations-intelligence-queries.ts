import {
  getAverageFinalTaskScoresByStaff,
  getTaskReviewCountsByStaff,
  type StaffTaskReviewCounts,
} from "@/lib/retail-tasks/retail-tasks-db";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  auditOperationsIntelligenceSchema,
  detectSubmissionStaffColumn,
  logOpsWidgetFailure,
  runSafeWidget,
  type OpsIntelligenceSchemaReport,
  type OpsWidgetWarning,
} from "@/lib/operations-intelligence-schema";

type Supabase = ReturnType<typeof createAdminClient>;

export type TaskShopDayCounts = {
  task_count: number;
  overdue: number;
  exceptions: number;
};

export type SafeRejectedProofsResult = {
  counts: Map<string, number>;
  warning: OpsWidgetWarning | null;
};

/** Per-shop task counts for one or more due dates — safe wrapper. */
export async function safeGetTaskShopStatsForDates(
  supabase: Supabase,
  companyId: string,
  dates: string[],
): Promise<{ data: Map<string, Map<string, TaskShopDayCounts>>; warning: OpsWidgetWarning | null }> {
  return runSafeWidget(
    "task_analytics",
    "retail_tasks.select(shop_id, status, due_date, due_time)",
    () => getTaskShopStatsForDatesCore(supabase, companyId, dates),
    new Map(),
  );
}

async function getTaskShopStatsForDatesCore(
  supabase: Supabase,
  companyId: string,
  dates: string[],
): Promise<Map<string, Map<string, TaskShopDayCounts>>> {
  const byDate = new Map<string, Map<string, TaskShopDayCounts>>();
  if (dates.length === 0) return byDate;

  const { data, error } = await supabase
    .from("retail_tasks")
    .select("shop_id, status, due_date, due_time")
    .eq("company_id", companyId)
    .in("due_date", dates);
  if (error) throw new Error(error.message);

  for (const date of dates) {
    byDate.set(date, new Map());
  }

  for (const row of data ?? []) {
    const dueDate = String(row.due_date);
    const shopId = String(row.shop_id);
    const dayMap = byDate.get(dueDate);
    if (!dayMap) continue;

    const bucket = dayMap.get(shopId) ?? { task_count: 0, overdue: 0, exceptions: 0 };
    bucket.task_count += 1;
    const display = displayTaskStatus(
      row.status as TaskStatus,
      dueDate,
      row.due_time as string | null,
    );
    if (display === "overdue") bucket.overdue += 1;
    if (row.status === "exception_reported") bucket.exceptions += 1;
    dayMap.set(shopId, bucket);
  }

  return byDate;
}

/**
 * Rejected task proofs per staff — uses submitted_by (not staff_id).
 * Falls back to two-step query if embed join fails.
 */
export async function safeGetRejectedProofCountsByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<SafeRejectedProofsResult> {
  const counts = new Map<string, number>();

  const staffColumnResult = await detectSubmissionStaffColumn(supabase);
  const staffColumn = staffColumnResult.column;

  if (!staffColumn) {
    return {
      counts,
      warning: logOpsWidgetFailure({
        widget: "staff_reliability",
        query: "retail_task_submissions staff link column probe",
        error: new Error(
          "No staff link column on retail_task_submissions (expected submitted_by)",
        ),
      }),
    };
  }

  try {
    const embedded = await fetchRejectedProofsEmbedded(
      supabase,
      companyId,
      sinceIso,
      staffColumn,
    );
    return { counts: embedded, warning: null };
  } catch (embeddedError) {
    console.warn("[operations-intelligence] embedded rejected-proofs query failed, retrying two-step", {
      widget: "staff_reliability",
      staff_column: staffColumn,
      error: embeddedError instanceof Error ? embeddedError.message : embeddedError,
    });

    try {
      const twoStep = await fetchRejectedProofsTwoStep(
        supabase,
        companyId,
        sinceIso,
        staffColumn,
      );
      return { counts: twoStep, warning: null };
    } catch (twoStepError) {
      return {
        counts,
        warning: logOpsWidgetFailure({
          widget: "staff_reliability",
          query: `retail_task_verifications + retail_task_submissions.${staffColumn}`,
          error: twoStepError,
        }),
      };
    }
  }
}

async function fetchRejectedProofsEmbedded(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
  staffColumn: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const select = `decision, verified_at, retail_task_submissions(${staffColumn}), retail_tasks!inner(company_id)`;

  const { data, error } = await supabase
    .from("retail_task_verifications")
    .select(select)
    .eq("decision", "rejected")
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const submission = row.retail_task_submissions as Record<string, string | null> | null;
    const staffId = submission?.[staffColumn];
    if (!staffId) continue;
    counts.set(staffId, (counts.get(staffId) ?? 0) + 1);
  }

  return counts;
}

async function fetchRejectedProofsTwoStep(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
  staffColumn: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  const { data: verifications, error: verErr } = await supabase
    .from("retail_task_verifications")
    .select("submission_id, task_id, retail_tasks!inner(company_id)")
    .eq("decision", "rejected")
    .eq("retail_tasks.company_id", companyId)
    .gte("verified_at", sinceIso);
  if (verErr) throw new Error(verErr.message);

  const submissionIds = [
    ...new Set(
      (verifications ?? [])
        .map((v) => v.submission_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  if (submissionIds.length === 0) return counts;

  const { data: submissions, error: subErr } = await supabase
    .from("retail_task_submissions")
    .select(`id, ${staffColumn}`)
    .in("id", submissionIds);
  if (subErr) throw new Error(subErr.message);

  const staffBySubmission = new Map<string, string>();
  for (const sub of (submissions ?? []) as unknown as Array<Record<string, string>>) {
    const staffId = sub[staffColumn];
    if (staffId) staffBySubmission.set(String(sub.id), staffId);
  }

  for (const v of (verifications ?? []) as unknown as Array<{ submission_id: string | null }>) {
    const submissionId = v.submission_id as string | null;
    if (!submissionId) continue;
    const staffId = staffBySubmission.get(submissionId);
    if (!staffId) continue;
    counts.set(staffId, (counts.get(staffId) ?? 0) + 1);
  }

  return counts;
}

export type SafeTaskReviewCountsResult = {
  counts: Map<string, StaffTaskReviewCounts>;
  warning: OpsWidgetWarning | null;
};

export async function safeGetTaskReviewCountsByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<SafeTaskReviewCountsResult> {
  const result = await runSafeWidget(
    "staff_reliability",
    "retail_task_verifications review outcomes",
    () => getTaskReviewCountsByStaff(supabase, companyId, sinceIso),
    new Map<string, StaffTaskReviewCounts>(),
  );
  return { counts: result.data, warning: result.warning };
}

export type SafeAvgFinalTaskScoresResult = {
  scores: Map<string, number>;
  warning: OpsWidgetWarning | null;
};

export async function safeGetAverageFinalTaskScoresByStaff(
  supabase: Supabase,
  companyId: string,
  sinceIso: string,
): Promise<SafeAvgFinalTaskScoresResult> {
  const result = await runSafeWidget(
    "staff_reliability",
    "retail_task_verifications final_score averages",
    () => getAverageFinalTaskScoresByStaff(supabase, companyId, sinceIso),
    new Map<string, number>(),
  );
  return { scores: result.data, warning: result.warning };
}

export async function loadOperationsIntelligenceSchemaReport(
  supabase: Supabase,
): Promise<OpsIntelligenceSchemaReport> {
  return auditOperationsIntelligenceSchema(supabase);
}
