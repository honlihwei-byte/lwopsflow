import {
  attendanceForTotals,
  sortByEventTime,
  type AttendanceRecord,
} from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";

export type DayAttendanceIssue = "missing_clock_in" | "missing_clock_out";

export type DayAttendanceIssueResult = {
  missing_clock_in: boolean;
  missing_clock_out: boolean;
  missing_punch: boolean;
  issues: DayAttendanceIssue[];
  issue_labels: string[];
};

export function detectDayAttendanceIssues(
  rows: AttendanceRecord[],
  dayYmd?: string,
): DayAttendanceIssueResult {
  const counted = attendanceForTotals(rows);
  const issues: DayAttendanceIssue[] = [];

  if (counted.length === 0) {
    return {
      missing_clock_in: false,
      missing_clock_out: false,
      missing_punch: false,
      issues: [],
      issue_labels: [],
    };
  }

  const sorted = sortByEventTime(counted);
  const hasIn = sorted.some((r) => r.action_type === "clock_in");
  const hasOut = sorted.some((r) => r.action_type === "clock_out");
  const last = sorted[sorted.length - 1]!;

  const missing_clock_in = hasOut && !hasIn;
  const missing_clock_out = hasIn && last.action_type === "clock_in";

  if (missing_clock_in) issues.push("missing_clock_in");
  if (missing_clock_out) issues.push("missing_clock_out");

  const issue_labels: string[] = [];
  if (missing_clock_in) issue_labels.push("Missing Clock In");
  if (missing_clock_out) issue_labels.push("Missing Clock Out");

  return {
    missing_clock_in,
    missing_clock_out,
    missing_punch: issues.length > 0,
    issues,
    issue_labels,
  };
}

export type PunchSequenceIssueResult = {
  duplicate_punch: boolean;
  suspicious_punch_sequence: boolean;
  consecutive_in_without_out: boolean;
  consecutive_out_without_in: boolean;
  multiple_in_out_same_day: boolean;
  duplicate_examples: Array<{ prev_id: string; cur_id: string; seconds_apart: number }>;
  suspicious_reasons: string[];
};

/** Detect duplicate / suspicious punch patterns (raw log unchanged). */
export function detectPunchSequenceIssues(rows: AttendanceRecord[]): PunchSequenceIssueResult {
  const sorted = sortByEventTime(attendanceForTotals(rows));
  let consecutive_in_without_out = false;
  let consecutive_out_without_in = false;
  const duplicate_examples: Array<{ prev_id: string; cur_id: string; seconds_apart: number }> = [];
  const suspicious_reasons: string[] = [];

  const DUP_WINDOW_SEC = 15;
  const MAX_DIST_CHANGE_M = 30;

  function meaningfulGpsChange(a: AttendanceRecord, b: AttendanceRecord): boolean {
    const da = Number(a.distance_from_shop_meters ?? NaN);
    const db = Number(b.distance_from_shop_meters ?? NaN);
    if (Number.isFinite(da) && Number.isFinite(db)) {
      if (Math.abs(da - db) > MAX_DIST_CHANGE_M) return true;
    }
    const la = a.staff_latitude;
    const lb = b.staff_latitude;
    const ga = a.staff_longitude;
    const gb = b.staff_longitude;
    if ([la, lb, ga, gb].every((x) => typeof x === "number" && Number.isFinite(x))) {
      // ~0.0001 deg ≈ 11m; treat larger as meaningful movement.
      if (Math.abs((la as number) - (lb as number)) > 0.0001) return true;
      if (Math.abs((ga as number) - (gb as number)) > 0.0001) return true;
    }
    return false;
  }

  function sameDevice(a: AttendanceRecord, b: AttendanceRecord): boolean {
    const da = (a.punch_device_id ?? "").trim();
    const db = (b.punch_device_id ?? "").trim();
    if (!da && !db) return true; // legacy / unknown device
    return da !== "" && da === db;
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.action_type === cur.action_type) {
      const sameShop = prev.shop_id === cur.shop_id;
      const deviceOk = sameDevice(prev, cur);
      const seconds = Math.abs(new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000;
      const closeInTime = seconds <= DUP_WINDOW_SEC;

      if (sameShop && deviceOk && closeInTime && !meaningfulGpsChange(prev, cur)) {
        // This is a true duplicate (same action, same shop, same device, rapid retry, no movement).
        if (cur.action_type === "clock_in") consecutive_in_without_out = true;
        if (cur.action_type === "clock_out") consecutive_out_without_in = true;
        duplicate_examples.push({ prev_id: prev.id, cur_id: cur.id, seconds_apart: Math.round(seconds) });
      }
    }
  }

  const inCount = sorted.filter((r) => r.action_type === "clock_in").length;
  const outCount = sorted.filter((r) => r.action_type === "clock_out").length;
  const multiple_in_out_same_day = inCount > 1 && outCount > 1;
  const duplicate_punch = consecutive_in_without_out || consecutive_out_without_in;
  const startsWithOut = sorted.length > 0 && sorted[0]!.action_type === "clock_out";
  const unbalanced = Math.abs(inCount - outCount) > 2;

  // Spam punching: many punches in a short time window.
  let rapidBurst = false;
  for (let i = 0; i < sorted.length; i++) {
    const start = new Date(sorted[i]!.created_at).getTime();
    let j = i;
    while (j < sorted.length) {
      const t = new Date(sorted[j]!.created_at).getTime();
      if (t - start > 60_000) break;
      j++;
    }
    if (j - i >= 6) {
      rapidBurst = true;
      break;
    }
  }

  const suspicious_punch_sequence =
    startsWithOut || rapidBurst || unbalanced || (multiple_in_out_same_day && duplicate_punch && duplicate_examples.length >= 2);

  if (startsWithOut) suspicious_reasons.push("Clock out without a prior clock in.");
  if (rapidBurst) suspicious_reasons.push("Many punches in a short time window (possible spam).");
  if (unbalanced) suspicious_reasons.push("Highly unbalanced in/out counts.");
  if (duplicate_punch && duplicate_examples.length >= 2) suspicious_reasons.push("Repeated duplicate retries detected.");

  return {
    duplicate_punch,
    suspicious_punch_sequence,
    consecutive_in_without_out,
    consecutive_out_without_in,
    multiple_in_out_same_day,
    duplicate_examples,
    suspicious_reasons,
  };
}
