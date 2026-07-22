/** Columns present since shop scheduling (031). Safe when schedule_type / sequence_no missing. */
export const SCHEDULE_SELECT_BASE =
  "id, company_id, shop_id, staff_id, shift_date, start_time, end_time, break_minutes, repeat_type, template_id, is_off_day, created_by, status, created_at, updated_at";

/** Full select when migrations 037 + 074 applied. */
export const SCHEDULE_SELECT_FULL = `${SCHEDULE_SELECT_BASE}, sequence_no, schedule_type`;

export function isMissingSchemaColumnError(
  error: { message?: string; code?: string } | null | undefined,
  column?: string,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const msg = String(error.message ?? "").toLowerCase();
  if (!msg.includes("does not exist")) return false;
  if (!column) return true;
  return msg.includes(column.toLowerCase());
}

export function scheduleSelectNeedsLegacyFallback(error: { message?: string; code?: string }): boolean {
  return (
    isMissingSchemaColumnError(error, "schedule_type") ||
    isMissingSchemaColumnError(error, "sequence_no")
  );
}
