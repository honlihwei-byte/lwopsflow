import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { OperationsDisplayStatus, OperationsStatus } from "@/lib/operations-center/types";

type DateFields = {
  status: OperationsStatus;
  publish_date: string;
  effective_date: string;
  end_date: string | null;
};

export function opsContentDisplayStatus(
  row: DateFields,
  day: string = malaysiaDateYmd(new Date()),
): OperationsDisplayStatus {
  if (row.status === "draft") return "draft";
  if (row.status === "archived") return "archived";
  if (row.end_date && row.end_date < day) return "ended";
  if (row.publish_date > day) return "published";
  if (row.effective_date > day) return "upcoming";
  return "active";
}

export function isOpsContentVisibleToEmployees(row: DateFields, day: string): boolean {
  if (row.status !== "published") return false;
  if (row.publish_date > day) return false;
  if (row.end_date && row.end_date < day) return false;
  return true;
}

export function isOpsContentActiveOnDate(
  row: Pick<DateFields, "effective_date" | "end_date">,
  day: string,
): boolean {
  if (row.effective_date > day) return false;
  if (row.end_date && row.end_date < day) return false;
  return true;
}
