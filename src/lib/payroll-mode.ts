export type PayrollMode = "actual_hours" | "scheduled_hours";

export const PAYROLL_MODE_LABELS: Record<PayrollMode, string> = {
  actual_hours: "Actual hours (punch in/out)",
  scheduled_hours: "Scheduled hours (recommended)",
};

export function normalizePayrollMode(value: unknown): PayrollMode {
  return value === "actual_hours" ? "actual_hours" : "scheduled_hours";
}

/** Paid hours for payroll: scheduled shift duration or actual worked (breaks already deducted). */
export function payrollHoursMs(
  payrollMode: PayrollMode,
  scheduledMs: number,
  actualWorkedMs: number,
): number {
  return payrollMode === "actual_hours" ? actualWorkedMs : scheduledMs;
}
