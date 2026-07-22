import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

/** Columns the Operations Intelligence layer expects on key tables. */
export const OPS_INTELLIGENCE_EXPECTED_SCHEMA = {
  retail_task_submissions: {
    staff_link_columns: ["submitted_by"] as const,
    required: ["id", "task_id", "submitted_by", "submitted_at", "status"] as const,
    optional: ["photo_url", "photo_urls", "checklist_completed", "comment"] as const,
  },
  retail_task_verifications: {
    required: ["id", "task_id", "submission_id", "decision", "verified_at"] as const,
  },
  retail_tasks: {
    required: ["id", "company_id", "shop_id", "status", "due_date", "due_time"] as const,
  },
} as const;

export type OpsWidgetId =
  | "shop_health"
  | "today_risks"
  | "staff_reliability"
  | "most_improved"
  | "workload_insights"
  | "task_analytics"
  | "manager_score";

export type SchemaColumnAudit = {
  table: string;
  expected_columns: string[];
  actual_columns: string[];
  missing_columns: string[];
  staff_link_column: string | null;
  broken_joins: string[];
};

export type OpsIntelligenceSchemaReport = {
  tables: SchemaColumnAudit[];
  required_migrations: string[];
};

export type OpsWidgetWarning = {
  widget: OpsWidgetId;
  message: string;
  query?: string;
  missing_column?: string;
  failed_query?: string;
};

const SUBMISSION_STAFF_COLUMN_CANDIDATES = [
  "submitted_by",
  "staff_id",
  "employee_id",
  "created_by",
] as const;

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("does not exist") || (lower.includes("column") && lower.includes("not found"));
}

function extractMissingColumn(message: string): string | undefined {
  const m =
    /column\s+(?:[\w.]+\.)?(\w+)\s+does not exist/i.exec(message) ??
    /Could not find the '(\w+)' column/i.exec(message);
  return m?.[1];
}

/** Probe which staff-link column exists on retail_task_submissions. */
export async function detectSubmissionStaffColumn(
  supabase: Supabase,
): Promise<{ column: string | null; actual_columns: string[] }> {
  const actual_columns: string[] = [];

  for (const col of SUBMISSION_STAFF_COLUMN_CANDIDATES) {
    const { error } = await supabase.from("retail_task_submissions").select(col).limit(1);
    if (!error) {
      actual_columns.push(col);
    }
  }

  const preferred = OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_submissions.staff_link_columns[0];
  if (actual_columns.includes(preferred)) {
    return { column: preferred, actual_columns };
  }

  const fallback = SUBMISSION_STAFF_COLUMN_CANDIDATES.find((c) => actual_columns.includes(c));
  return { column: fallback ?? null, actual_columns };
}

async function probeTableColumns(
  supabase: Supabase,
  table: string,
  columns: readonly string[],
): Promise<{ present: string[]; missing: string[] }> {
  const present: string[] = [];
  const missing: string[] = [];

  for (const col of columns) {
    const { error } = await supabase.from(table).select(col).limit(1);
    if (error && isMissingColumnError(error.message)) {
      missing.push(col);
    } else if (!error) {
      present.push(col);
    } else {
      missing.push(col);
    }
  }

  return { present, missing };
}

export async function auditOperationsIntelligenceSchema(
  supabase: Supabase,
): Promise<OpsIntelligenceSchemaReport> {
  const tables: SchemaColumnAudit[] = [];
  const required_migrations: string[] = [];

  const submissionStaff = await detectSubmissionStaffColumn(supabase);
  const submissionProbe = await probeTableColumns(supabase, "retail_task_submissions", [
    ...OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_submissions.required,
    ...OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_submissions.optional,
  ]);

  const broken_joins: string[] = [];
  if (!submissionStaff.column) {
    broken_joins.push(
      "retail_task_verifications → retail_task_submissions (no staff link column found)",
    );
    required_migrations.push(
      "Ensure retail_task_submissions.submitted_by uuid references staff(id) — see migration 056_retail_daily_tasks.sql",
    );
  } else if (submissionStaff.column !== "submitted_by") {
    broken_joins.push(
      `retail_task_submissions uses '${submissionStaff.column}' instead of expected 'submitted_by'`,
    );
  }

  tables.push({
    table: "retail_task_submissions",
    expected_columns: [...OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_submissions.required],
    actual_columns: submissionProbe.present,
    missing_columns: submissionProbe.missing,
    staff_link_column: submissionStaff.column,
    broken_joins,
  });

  const verificationsProbe = await probeTableColumns(
    supabase,
    "retail_task_verifications",
    OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_verifications.required,
  );
  if (verificationsProbe.missing.length > 0) {
    required_migrations.push(
      "Apply migration 056_retail_daily_tasks.sql for retail_task_verifications table",
    );
  }
  tables.push({
    table: "retail_task_verifications",
    expected_columns: [...OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_task_verifications.required],
    actual_columns: verificationsProbe.present,
    missing_columns: verificationsProbe.missing,
    staff_link_column: null,
    broken_joins: [],
  });

  const tasksProbe = await probeTableColumns(
    supabase,
    "retail_tasks",
    OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_tasks.required,
  );
  if (tasksProbe.missing.length > 0) {
    required_migrations.push("Apply migration 056_retail_daily_tasks.sql for retail_tasks table");
  }
  tables.push({
    table: "retail_tasks",
    expected_columns: [...OPS_INTELLIGENCE_EXPECTED_SCHEMA.retail_tasks.required],
    actual_columns: tasksProbe.present,
    missing_columns: tasksProbe.missing,
    staff_link_column: null,
    broken_joins: [],
  });

  return { tables, required_migrations: [...new Set(required_migrations)] };
}

export function logOpsWidgetFailure(params: {
  widget: OpsWidgetId;
  error: unknown;
  query?: string;
}): OpsWidgetWarning {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  const missing_column = extractMissingColumn(message);

  console.warn("[operations-intelligence] widget query failed", {
    widget: params.widget,
    missing_column: missing_column ?? null,
    failed_query: params.query ?? null,
    error: message,
  });

  return {
    widget: params.widget,
    message,
    query: params.query,
    missing_column,
    failed_query: params.query,
  };
}

const WIDGET_TIMEOUT_MS = 18_000;

export async function runSafeWidget<T>(
  widget: OpsWidgetId,
  queryLabel: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; warning: OpsWidgetWarning | null }> {
  try {
    const data = await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Widget "${widget}" timed out after ${WIDGET_TIMEOUT_MS}ms`)),
          WIDGET_TIMEOUT_MS,
        );
      }),
    ]);
    return { data, warning: null };
  } catch (error) {
    return { data: fallback, warning: logOpsWidgetFailure({ widget, error, query: queryLabel }) };
  }
}
