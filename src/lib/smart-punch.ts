import {
  attendancePhase,
  countedPunches,
  sortByEventTime,
  type AttendancePhase,
  type AttendanceRecord,
  type PunchActionType,
} from "@/lib/attendance";
import { recordEventTime } from "@/lib/attendance-db";

export const DUPLICATE_PREVENTED_AUDIT_PREFIX = "Duplicate prevented:";
export const SMART_PUNCH_DUPLICATE_WINDOW_MS = 5_000;

export type SmartPunchSessionState = "not_active" | "active";

export type SmartPunchBlockCode =
  | "already_clocked_in"
  | "already_clocked_out"
  | "duplicate_prevented"
  | "rest_before_clock_in"
  | "already_on_break"
  | "not_on_break";

export type SmartPunchValidation =
  | {
      ok: true;
      session: SmartPunchSessionState;
      phase: AttendancePhase;
      expectedAction: "clock_in" | "clock_out";
      /** Clock-out saved while still on break — flag the day for review (not a block). */
      missingRestIn: boolean;
    }
  | {
      ok: false;
      code: SmartPunchBlockCode;
      message: string;
      guardNote: string;
    };

export function isDuplicatePreventedGuardRow(row: AttendanceRecord): boolean {
  return Boolean(row.audit_notes?.startsWith(DUPLICATE_PREVENTED_AUDIT_PREFIX));
}

/** Active session: employee is clocked in (working or on break). */
export function smartPunchSessionState(rows: AttendanceRecord[]): SmartPunchSessionState {
  return attendancePhase(rows) === "not_active" ? "not_active" : "active";
}

export function smartPunchExpectedAction(
  session: SmartPunchSessionState,
): "clock_in" | "clock_out" {
  return session === "active" ? "clock_out" : "clock_in";
}

export function lastClockInRecord(rows: AttendanceRecord[]): AttendanceRecord | undefined {
  const ins = sortByEventTime(countedPunches(rows)).filter((r) => r.action_type === "clock_in");
  return ins.length > 0 ? ins[ins.length - 1] : undefined;
}

/** Duplicate guard: same action repeated within the debounce window. */
function duplicateWithinWindow(
  rows: AttendanceRecord[],
  actionType: PunchActionType,
  duplicateWindowMs: number,
): SmartPunchValidation | null {
  const counted = countedPunches(rows);
  if (counted.length === 0) return null;
  const sorted = sortByEventTime(counted);
  const last = sorted[sorted.length - 1]!;
  if (last.action_type !== actionType) return null;
  const elapsed = Date.now() - new Date(last.created_at).getTime();
  if (elapsed >= duplicateWindowMs) return null;
  const timeLabel = recordEventTime(last).slice(0, 8);
  return {
    ok: false,
    code: "duplicate_prevented",
    message: `${PUNCH_ACTION_LABEL[actionType]} was already saved at ${timeLabel}. Please wait a few seconds.`,
    guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Repeated ${actionType} within ${duplicateWindowMs / 1000}s.`,
  };
}

const PUNCH_ACTION_LABEL: Record<PunchActionType, string> = {
  clock_in: "Clock In",
  clock_out: "Clock Out",
  rest_out: "Rest Out",
  rest_in: "Rest In",
};

/**
 * Validate a punch against the rest-aware state machine.
 *
 * Phases & allowed transitions:
 *   not_active → clock_in
 *   working    → rest_out | clock_out
 *   on_break   → rest_in  | clock_out (clock_out sets missingRestIn = true, never blocked)
 */
export function validateSmartPunch(
  actionType: PunchActionType,
  rows: AttendanceRecord[],
  shopName: string,
  duplicateWindowMs: number = SMART_PUNCH_DUPLICATE_WINDOW_MS,
  virtualClockIn?: AttendanceRecord | null,
): SmartPunchValidation {
  const phaseRows =
    virtualClockIn && virtualClockIn.action_type === "clock_in"
      ? [...rows, virtualClockIn]
      : rows;
  const phase = attendancePhase(phaseRows);
  const session: SmartPunchSessionState = phase === "not_active" ? "not_active" : "active";
  const expectedAction = smartPunchExpectedAction(session);

  const dup = duplicateWithinWindow(rows, actionType, duplicateWindowMs);
  if (dup) return dup;

  const ok = (missingRestIn = false): SmartPunchValidation => ({
    ok: true,
    session,
    phase,
    expectedAction,
    missingRestIn,
  });

  switch (actionType) {
    case "clock_in": {
      if (phase !== "not_active") {
        const lastIn = lastClockInRecord(rows);
        const timeLabel = lastIn ? recordEventTime(lastIn).slice(0, 8) : "—";
        const atShop = lastIn?.shop_name?.trim() || shopName;
        return {
          ok: false,
          code: "already_clocked_in",
          message: `You are already clocked in. Last clock in: ${timeLabel} at ${atShop}.`,
          guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Already clocked in (attempted clock in).`,
        };
      }
      return ok();
    }

    case "clock_out": {
      if (phase === "not_active") {
        return {
          ok: false,
          code: "already_clocked_out",
          message: "You are already clocked out.",
          guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Already clocked out (attempted clock out).`,
        };
      }
      // working → normal clock out; on_break → allowed, flag missing rest in.
      return ok(phase === "on_break");
    }

    case "rest_out": {
      if (phase === "not_active") {
        return {
          ok: false,
          code: "rest_before_clock_in",
          message: "Please clock in before starting a break.",
          guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Rest out before clock in.`,
        };
      }
      if (phase === "on_break") {
        return {
          ok: false,
          code: "already_on_break",
          message: "You are already on break.",
          guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Rest out while already on break.`,
        };
      }
      return ok();
    }

    case "rest_in": {
      if (phase !== "on_break") {
        return {
          ok: false,
          code: "not_on_break",
          message: "You are not on break.",
          guardNote: `${DUPLICATE_PREVENTED_AUDIT_PREFIX} Rest in while not on break.`,
        };
      }
      return ok();
    }
  }
}
