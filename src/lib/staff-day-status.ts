import { detectDayAttendanceIssues } from "@/lib/attendance-issues";
import {
  attendanceForTotals,
  countedPunches,
  displayPunchActionType,
  firstClockIn,
  formatDuration,
  lastClockOut,
  sortByEventTime,
  totalWorkedMsForDay,
  type AttendancePhase,
  type AttendanceRecord,
  type PunchActionType,
} from "@/lib/attendance";
import type { ForgotPunchVirtualContext } from "@/lib/forgot-punch-virtual";
import {
  attendancePhaseWithVirtualClockIn,
  hasRealClockIn,
  realAttendanceRows,
  virtualClockInForPendingRequest,
} from "@/lib/forgot-punch-virtual";
import {
  lastClockInRecord,
  smartPunchExpectedAction,
} from "@/lib/smart-punch";
import { recordEventTime } from "@/lib/attendance-db";
import {
  staffPunchLocationCodeFromRecord,
  type StaffLocationCode,
} from "@/lib/staff-punch-display";
import { formatMalaysiaRecordedAt, malaysiaDateYmd, malaysiaTimeHms } from "@/lib/malaysia-time";

export type StaffTodayStatusKey =
  | "not_clocked_in"
  | "in_shop"
  | "out"
  | "missing_clock_out"
  | "pending_clock_in_verification";

/** English fallbacks for non-UI consumers; employee UI translates `status` codes. */
export const STAFF_TODAY_STATUS_LABELS: Record<StaffTodayStatusKey, string> = {
  not_clocked_in: "not_clocked_in",
  in_shop: "in_shop",
  out: "out",
  missing_clock_out: "missing_clock_out",
  pending_clock_in_verification: "pending_clock_in_verification",
};

/** Minimal rows for smart-punch validation on the clock page. */
export type StaffTodayPunchValidationRow = Pick<
  AttendanceRecord,
  "id" | "action_type" | "created_at" | "event_time" | "shop_name" | "audit_notes"
> & {
  photo_proof_used?: boolean | null;
  staff_latitude?: number | null;
  staff_longitude?: number | null;
  gps_verified?: boolean | null;
  verification_method?: string | null;
};

export type StaffTodayPunchLogEntry = {
  id: string;
  time_label: string;
  action_type: PunchActionType;
  action_short: string;
  gps_status_code: StaffLocationCode;
  created_at: string;
};

export type StaffTodayStatusSummary = {
  day_ymd: string;
  status: StaffTodayStatusKey;
  status_label: string;
  first_in: string | null;
  last_out: string | null;
  total_hours_label: string;
  latest_action: PunchActionType | null;
  latest_time: string | null;
  latest_gps_status_code: StaffLocationCode | null;
  suggest_clock_in: boolean;
  suggest_clock_out: boolean;
  active_session: boolean;
  smart_punch_action: "clock_in" | "clock_out";
  /** Rest-aware presence phase: not_active | working | on_break. */
  attendance_phase: AttendancePhase;
  last_clock_in_time: string | null;
  last_clock_in_shop: string | null;
  history: StaffTodayPunchLogEntry[];
  punch_validation_rows: StaffTodayPunchValidationRow[];
  attendance_issues: {
    missing_clock_in: boolean;
    missing_clock_out: boolean;
    missing_punch: boolean;
    issue_labels: string[];
  };
  pending_clock_in_verification: boolean;
  forgot_punch_pending_id: string | null;
  forgot_punch_rejected: boolean;
};

export function staffTodayStatusKey(
  rows: AttendanceRecord[],
  opts?: { phase?: AttendancePhase; pendingClockInVerification?: boolean },
): StaffTodayStatusKey {
  const realRows = realAttendanceRows(rows);
  const counted = attendanceForTotals(realRows);
  if (counted.length === 0) {
    if (opts?.pendingClockInVerification && opts.phase && opts.phase !== "not_active") {
      return "pending_clock_in_verification";
    }
    if (opts?.pendingClockInVerification) {
      return "pending_clock_in_verification";
    }
    return "not_clocked_in";
  }

  const issues = detectDayAttendanceIssues(realRows);
  if (issues.missing_clock_out) return "missing_clock_out";

  const sorted = sortByEventTime(counted);
  const last = sorted[sorted.length - 1]!;

  if (last.action_type === "clock_out") return "out";
  if (last.action_type === "clock_in" || opts?.pendingClockInVerification) {
    return opts?.pendingClockInVerification ? "pending_clock_in_verification" : "in_shop";
  }
  return "not_clocked_in";
}

export type BuildStaffTodayStatusOptions = {
  forgotPunchVirtual?: ForgotPunchVirtualContext;
  shopName?: string;
};

export function buildStaffTodayStatusSummary(
  rows: AttendanceRecord[],
  dayYmd: string,
  opts?: BuildStaffTodayStatusOptions,
): StaffTodayStatusSummary {
  const realRows = realAttendanceRows(rows);
  const virtualClockIn = virtualClockInForPendingRequest(
    realRows,
    opts?.forgotPunchVirtual?.pending_clock_in ?? null,
    opts?.shopName ?? "",
    dayYmd,
  );
  const pendingClockInVerification = Boolean(virtualClockIn);
  const phase = attendancePhaseWithVirtualClockIn(realRows, virtualClockIn);
  const status = staffTodayStatusKey(realRows, {
    phase,
    pendingClockInVerification,
  });
  const counted = attendanceForTotals(realRows);
  const fi = firstClockIn(realRows);
  const lo = lastClockOut(realRows);
  const sorted = sortByEventTime(counted);
  const last = sorted.length > 0 ? sorted[sorted.length - 1]! : null;

  const allPunches = sortByEventTime(countedPunches(realRows));
  const history: StaffTodayPunchLogEntry[] = allPunches.map((r) => {
    const action = displayPunchActionType(r, realRows);
    return {
    id: r.id,
    time_label: recordEventTime(r).slice(0, 5),
    action_type: action,
    action_short: action,
    gps_status_code: staffPunchLocationCodeFromRecord(r),
    created_at: r.created_at,
  };
  });

  const session = phase === "not_active" ? "not_active" : "active";
  const active_session = session === "active";
  const smart_punch_action = smartPunchExpectedAction(session);
  const lastIn = lastClockInRecord(realRows) ?? virtualClockIn ?? undefined;
  const suggest_clock_in = smart_punch_action === "clock_in";
  const suggest_clock_out = smart_punch_action === "clock_out";
  let attendance_issues = detectDayAttendanceIssues(realRows);

  if (pendingClockInVerification) {
    attendance_issues = {
      ...attendance_issues,
      missing_clock_in: false,
      missing_punch: attendance_issues.missing_clock_out,
      issue_labels: attendance_issues.issue_labels.filter(
        (l) => l !== "Missing Clock In",
      ),
    };
    if (!attendance_issues.issue_labels.includes("Pending Clock In Verification")) {
      attendance_issues.issue_labels.unshift("Pending Clock In Verification");
    }
  } else if (opts?.forgotPunchVirtual?.rejected_clock_in && !hasRealClockIn(realRows)) {
    attendance_issues = {
      ...attendance_issues,
      missing_clock_in: true,
      missing_punch: true,
      issue_labels: [
        "Forgot Clock In Rejected",
        ...attendance_issues.issue_labels.filter((l) => l !== "Missing Clock In"),
        ...(attendance_issues.missing_clock_in ? ["Missing Clock In"] : []),
      ],
    };
  }

  return {
    day_ymd: dayYmd,
    status,
    status_label: STAFF_TODAY_STATUS_LABELS[status],
    first_in: fi
      ? recordEventTime(fi)
      : virtualClockIn
        ? recordEventTime(virtualClockIn)
        : null,
    last_out: lo ? recordEventTime(lo) : null,
    total_hours_label: formatDuration(totalWorkedMsForDay(realRows)),
    latest_action:
      allPunches.length > 0
        ? displayPunchActionType(allPunches[allPunches.length - 1]!, realRows)
        : null,
    latest_time:
      allPunches.length > 0 ? recordEventTime(allPunches[allPunches.length - 1]!) : null,
    latest_gps_status_code:
      allPunches.length > 0
        ? staffPunchLocationCodeFromRecord(allPunches[allPunches.length - 1]!)
        : null,
    suggest_clock_in,
    suggest_clock_out,
    active_session,
    smart_punch_action,
    attendance_phase: phase,
    last_clock_in_time: lastIn ? recordEventTime(lastIn) : null,
    last_clock_in_shop: lastIn?.shop_name?.trim() || null,
    history,
    punch_validation_rows: realRows.map((r) => ({
      id: r.id,
      action_type: r.action_type,
      created_at: r.created_at,
      event_time: r.event_time,
      shop_name: r.shop_name,
      audit_notes: r.audit_notes,
      photo_proof_used: r.photo_proof_used,
      staff_latitude: r.staff_latitude,
      staff_longitude: r.staff_longitude,
      gps_verified: r.gps_verified,
      verification_method: r.verification_method,
    })),
    attendance_issues: {
      missing_clock_in: attendance_issues.missing_clock_in,
      missing_clock_out: attendance_issues.missing_clock_out,
      missing_punch: attendance_issues.missing_punch,
      issue_labels: attendance_issues.issue_labels,
    },
    pending_clock_in_verification: pendingClockInVerification,
    forgot_punch_pending_id: opts?.forgotPunchVirtual?.pending_clock_in?.id ?? null,
    forgot_punch_rejected: Boolean(opts?.forgotPunchVirtual?.rejected_clock_in),
  };
}

/** Block repeating the same action within `windowMs` of the latest punch. */
export function duplicateActionBlocked(
  rows: AttendanceRecord[],
  actionType: "clock_in" | "clock_out",
  windowMs: number,
): { blocked: boolean; message: string | null } {
  const counted = attendanceForTotals(rows);
  if (counted.length === 0) return { blocked: false, message: null };
  const sorted = sortByEventTime(counted);
  const last = sorted[sorted.length - 1]!;
  // `counted` excludes rest punches, so last is always clock_in/clock_out.
  const lastClockAction: "clock_in" | "clock_out" =
    last.action_type === "clock_in" ? "clock_in" : "clock_out";
  return duplicateActionBlockedFromLast(
    lastClockAction,
    last.created_at,
    actionType,
    windowMs,
    recordEventTime(last),
  );
}

export function duplicateActionBlockedFromHistory(
  history: StaffTodayPunchLogEntry[],
  actionType: "clock_in" | "clock_out",
  windowMs: number,
): { blocked: boolean; message: string | null } {
  if (history.length === 0) return { blocked: false, message: null };
  const lastClock = [...history].reverse().find(
    (h): h is StaffTodayPunchLogEntry & { action_type: "clock_in" | "clock_out" } =>
      h.action_type === "clock_in" || h.action_type === "clock_out",
  );
  if (!lastClock) return { blocked: false, message: null };
  return duplicateActionBlockedFromLast(
    lastClock.action_type,
    lastClock.created_at,
    actionType,
    windowMs,
    formatMalaysiaRecordedAt(lastClock.created_at),
  );
}

function duplicateActionBlockedFromLast(
  lastAction: "clock_in" | "clock_out",
  lastCreatedAt: string,
  actionType: "clock_in" | "clock_out",
  windowMs: number,
  lastTimeLabel: string,
): { blocked: boolean; message: string | null } {
  if (lastAction !== actionType) return { blocked: false, message: null };
  const elapsed = Date.now() - new Date(lastCreatedAt).getTime();
  if (elapsed >= windowMs) return { blocked: false, message: null };
  const waitSec = Math.ceil((windowMs - elapsed) / 1000);
  const label = actionType === "clock_in" ? "Clock In" : "Clock Out";
  return {
    blocked: true,
    message: `${label} was already saved at ${lastTimeLabel.slice(0, 8)}. Wait ${waitSec}s before punching again.`,
  };
}

/** Immediate UI update after punch while today-status API refreshes in background. */
export function applyOptimisticPunchToTodayStatus(
  prev: StaffTodayStatusSummary | null,
  actionType: PunchActionType,
  opts?: { usedPhotoProof?: boolean },
): StaffTodayStatusSummary | null {
  if (!prev) return prev;
  const now = new Date();
  const timeFull = malaysiaTimeHms(now);
  const timeLabel = timeFull.slice(0, 5);
  const locationCode: StaffLocationCode = opts?.usedPhotoProof
    ? "photo_proof"
    : "location_approved";

  // Rest punches don't open/close the work session — only update the phase.
  if (actionType === "rest_out" || actionType === "rest_in") {
    const restPhase: AttendancePhase = actionType === "rest_out" ? "on_break" : "working";
    return {
      ...prev,
      attendance_phase: restPhase,
      latest_time: timeFull,
      latest_gps_status_code: locationCode,
    };
  }

  const entry: StaffTodayPunchLogEntry = {
    id: `optimistic-${now.getTime()}`,
    time_label: timeLabel,
    action_type: actionType,
    action_short: actionType === "clock_in" ? "In" : "Out",
    gps_status_code: locationCode,
    created_at: now.toISOString(),
  };
  const history = [...prev.history, entry];
  const nextAction: "clock_in" | "clock_out" =
    actionType === "clock_in" ? "clock_out" : "clock_in";
  return {
    ...prev,
    status: actionType === "clock_in" ? "in_shop" : "out",
    status_label:
      actionType === "clock_in"
        ? STAFF_TODAY_STATUS_LABELS.in_shop
        : STAFF_TODAY_STATUS_LABELS.out,
    first_in: prev.first_in ?? (actionType === "clock_in" ? timeFull : null),
    last_out: actionType === "clock_out" ? timeFull : prev.last_out,
    latest_action: actionType,
    latest_time: timeFull,
    latest_gps_status_code: locationCode,
    suggest_clock_in: actionType === "clock_out",
    suggest_clock_out: actionType === "clock_in",
    active_session: actionType === "clock_in",
    smart_punch_action: nextAction,
    attendance_phase: actionType === "clock_in" ? "working" : "not_active",
    last_clock_in_time:
      actionType === "clock_in" ? timeFull : prev.last_clock_in_time,
    history,
  };
}
