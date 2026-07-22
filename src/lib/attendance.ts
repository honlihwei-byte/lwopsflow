import { recordEventInstant } from "@/lib/attendance-db";
import {
  gpsDisplayStatus,
  gpsDisplayStatusClassName,
  type GpsDisplayStatus,
} from "@/lib/gps-display-status";
import type { SelfieUploadStatus } from "@/lib/selfie-proof-debug";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { isDuplicatePreventedGuardRow } from "@/lib/smart-punch";

export { recordEventInstant } from "@/lib/attendance-db";

/** Clock punches close/open the work session; rest punches bracket a break. */
export type PunchActionType = "clock_in" | "clock_out" | "rest_in" | "rest_out";

/** Work-session presence phase derived from the punch sequence. */
export type AttendancePhase = "not_active" | "working" | "on_break";

export const REST_ACTION_TYPES: ReadonlySet<PunchActionType> = new Set([
  "rest_in",
  "rest_out",
]);

export function isRestPunch(row: Pick<AttendanceRecord, "action_type">): boolean {
  return REST_ACTION_TYPES.has(row.action_type);
}

export type AttendanceRecord = {
  id: string;
  shop_id: string;
  shop_name: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  staff_type: string;
  action_type: PunchActionType;
  event_date: string;
  event_time: string;
  staff_latitude?: number | null;
  staff_longitude?: number | null;
  distance_from_shop_meters?: number | null;
  gps_accuracy_meters?: number | null;
  gps_verified?: boolean | null;
  gps_verify_tier?: string | null;
  gps_review_required?: boolean | null;
  location_confidence_score?: number | null;
  gps_indoor_fallback_used?: boolean | null;
  gps_radius_used_meters?: number | null;
  gps_confidence_label?: string | null;
  gps_verify_attempt?: number | null;
  gps_result_reason?: string | null;
  photo_proof_used?: boolean | null;
  photo_proof_path?: string | null;
  photo_proof_uploaded_at?: string | null;
  photo_proof_original_file_size?: number | null;
  photo_proof_compressed_file_size?: number | null;
  photo_proof_upload_duration_ms?: number | null;
  selfie_proof_used?: boolean | null;
  selfie_proof_path?: string | null;
  selfie_captured_at?: string | null;
  selfie_upload_status?: SelfieUploadStatus | null;
  verification_method?: string | null;
  audit_notes?: string | null;
  review_required?: boolean | null;
  missing_rest_in?: boolean | null;
  needs_review?: boolean | null;
  exception_type?: string | null;
  client_device_time?: string | null;
  punch_device_id?: string | null;
  device_fingerprint?: string | null;
  punch_device_name?: string | null;
  punch_browser_info?: string | null;
  punch_browser?: string | null;
  punch_platform?: string | null;
  punch_user_agent?: string | null;
  risk_score?: number | null;
  risk_level?: "low" | "medium" | "high" | string | null;
  device_trust_status?: "trusted" | "new_device" | string | null;
  buddy_punch_flag?: boolean | null;
  risk_flags?: string[] | null;
  created_at: string;
};

/** @deprecated Use GpsDisplayStatus — kept for report filter compatibility. */
export type GpsStatusLabel = GpsDisplayStatus;

export function gpsStatusClassName(status: GpsDisplayStatus): string {
  return gpsDisplayStatusClassName(status);
}

export function gpsStatusLabel(record: AttendanceRecord): GpsDisplayStatus {
  return gpsDisplayStatus(record);
}

export { gpsDisplayStatus, gpsShowReviewChip, type GpsDisplayStatus } from "@/lib/gps-display-status";

export function formatGpsDistanceMeters(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return `${Math.round(m)} m`;
}

/** True when staff has at least one countable punch in the row set. */
export function staffHasPunchRows(rows: AttendanceRecord[]): boolean {
  return attendanceForTotals(rows).length > 0;
}

/**
 * Accepted punches of ALL action types (clock + rest), excluding duplicate guards
 * and GPS-rejected rows. Used by the state machine which must see rest punches.
 */
export function countedPunches(rows: AttendanceRecord[]): AttendanceRecord[] {
  return rows.filter((r) => {
    if (isDuplicatePreventedGuardRow(r)) return false;
    if (r.photo_proof_used) return true;
    if (r.staff_latitude == null && r.staff_longitude == null) return true;
    return r.gps_verified === true;
  });
}

/**
 * Rows that count toward hours and presence (verified GPS or legacy without GPS fields).
 * Rest punches are excluded so existing hours/session/status math is unchanged.
 */
export function attendanceForTotals(rows: AttendanceRecord[]): AttendanceRecord[] {
  return countedPunches(rows).filter((r) => !isRestPunch(r));
}

/** Advance phase after an effective punch action. */
export function advanceAttendancePhase(
  phase: AttendancePhase,
  action: PunchActionType,
): AttendancePhase {
  switch (action) {
    case "clock_in":
      return phase === "not_active" ? "working" : phase;
    case "clock_out":
      return "not_active";
    case "rest_out":
      return phase === "working" ? "on_break" : phase;
    case "rest_in":
      return phase === "on_break" ? "working" : phase;
    default:
      return phase;
  }
}

/**
 * clock_in after rest_out means the employee returned from break — treat as rest_in.
 * Does not mutate stored records; use at calculation/display time only.
 */
export function effectivePunchAction(
  action: PunchActionType,
  phase: AttendancePhase,
): PunchActionType {
  if (action === "clock_in" && phase === "on_break") return "rest_in";
  return action;
}

/** Normalize punch sequence for hours/phase (infers rest_in from mistaken clock_in). */
export function normalizePunchesForSequence(rows: AttendanceRecord[]): AttendanceRecord[] {
  const sorted = sortByEventTime(countedPunches(rows));
  const out: AttendanceRecord[] = [];
  let phase: AttendancePhase = "not_active";
  for (const p of sorted) {
    const effective = effectivePunchAction(p.action_type, phase);
    out.push(effective === p.action_type ? p : { ...p, action_type: effective });
    phase = advanceAttendancePhase(phase, effective);
  }
  return out;
}

/** Display label action for one punch within a day (applies rest_in inference). */
export function displayPunchActionType(
  row: AttendanceRecord,
  dayRows: AttendanceRecord[],
): PunchActionType {
  const sorted = sortByEventTime(countedPunches(dayRows));
  let phase: AttendancePhase = "not_active";
  for (const p of sorted) {
    const effective = effectivePunchAction(p.action_type, phase);
    if (p.id === row.id) return effective;
    phase = advanceAttendancePhase(phase, effective);
  }
  return row.action_type;
}

/**
 * Current presence phase from the punch sequence (rest-aware).
 * not_active → outside shift; working → clocked in (not on break); on_break → rest_out without rest_in.
 */
export function attendancePhase(rows: AttendanceRecord[]): AttendancePhase {
  const sorted = normalizePunchesForSequence(rows);
  let phase: AttendancePhase = "not_active";
  for (const p of sorted) {
    phase = advanceAttendancePhase(phase, p.action_type);
  }
  return phase;
}

/** Sort punches by wall-clock event time (not DB created_at / approval time). */
export function sortByEventTime(rows: AttendanceRecord[]): AttendanceRecord[] {
  return [...rows].sort((a, b) => {
    const diff = recordEventInstant(a) - recordEventInstant(b);
    if (diff !== 0) return diff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/** @deprecated Prefer sortByEventTime for punch sequence. */
export function sortByCreatedAt(rows: AttendanceRecord[]): AttendanceRecord[] {
  return sortByEventTime(rows);
}

export type ValidPunchSession = {
  in: AttendanceRecord;
  out: AttendanceRecord;
  durationMs: number;
};

export type ValidPunchDayResult = {
  sessions: ValidPunchSession[];
  firstValidIn?: AttendanceRecord;
  lastValidOut?: AttendanceRecord;
  /** Unmatched clock-in still open (missing clock out). */
  openIn?: AttendanceRecord;
  totalMs: number;
};

/**
 * Walk punches in event-time order and build valid in→out sessions only.
 * Ignores duplicate clock-in while inside and duplicate clock-out while outside.
 * Unmatched clock-in does not add hours.
 */
export function computeValidPunchDay(rows: AttendanceRecord[]): ValidPunchDayResult {
  const sorted = sortByEventTime(attendanceForTotals(rows));
  const sessions: ValidPunchSession[] = [];
  let inside = false;
  let openIn: AttendanceRecord | null = null;
  let firstValidIn: AttendanceRecord | undefined;
  let lastValidOut: AttendanceRecord | undefined;
  let totalMs = 0;

  for (const p of sorted) {
    if (p.action_type === "clock_in") {
      if (!inside) {
        inside = true;
        openIn = p;
        if (!firstValidIn) firstValidIn = p;
      }
      continue;
    }

    if (inside && openIn) {
      const inMs = recordEventInstant(openIn);
      const outMs = recordEventInstant(p);
      if (outMs > inMs) {
        const durationMs = outMs - inMs;
        totalMs += durationMs;
        sessions.push({ in: openIn, out: p, durationMs });
        lastValidOut = p;
      }
      inside = false;
      openIn = null;
    }
  }

  return {
    sessions,
    firstValidIn,
    lastValidOut,
    openIn: inside && openIn ? openIn : undefined,
    totalMs,
  };
}

/** First accepted clock-in (duplicate ins while inside are ignored). */
export function firstClockIn(rows: AttendanceRecord[]): AttendanceRecord | undefined {
  return computeValidPunchDay(rows).firstValidIn;
}

/** Last accepted clock-out from a completed valid session. */
export function lastClockOut(rows: AttendanceRecord[]): AttendanceRecord | undefined {
  return computeValidPunchDay(rows).lastValidOut;
}

export type WorkHoursBreakdown = {
  /** Clock-out minus clock-in span (includes break time). */
  spanMs: number;
  /** Sum of rest_out → rest_in (or rest_out → clock_out when Rest In missing). */
  breakMs: number;
  /** Paid-eligible working time (span minus breaks, phase-based). */
  workedMs: number;
  missing_rest_in: boolean;
  invalid_break_sequence: boolean;
};

/**
 * Walk the full punch sequence (clock + rest) and accumulate working vs break
 * segments. Rest time is never counted as worked time.
 */
export function computeWorkHoursWithBreaks(rows: AttendanceRecord[]): WorkHoursBreakdown {
  const sorted = normalizePunchesForSequence(rows);
  if (sorted.length === 0) {
    return {
      spanMs: 0,
      breakMs: 0,
      workedMs: 0,
      missing_rest_in: false,
      invalid_break_sequence: false,
    };
  }

  type Phase = "outside" | "working" | "on_break";
  let phase: Phase = "outside";
  let segmentStart: number | null = null;
  let workedMs = 0;
  let breakMs = 0;
  let missing_rest_in = sorted.some(
    (r) => r.missing_rest_in === true || r.exception_type === "missing_rest_in",
  );
  let invalid_break_sequence = false;
  let firstInMs: number | null = null;
  let lastOutMs: number | null = null;

  function closeSegment(endMs: number) {
    if (segmentStart == null || endMs <= segmentStart) return;
    const dur = endMs - segmentStart;
    if (phase === "working") workedMs += dur;
    else if (phase === "on_break") breakMs += dur;
  }

  for (const p of sorted) {
    const t = recordEventInstant(p);
    switch (p.action_type) {
      case "clock_in":
        if (phase === "outside") {
          phase = "working";
          segmentStart = t;
          if (firstInMs == null) firstInMs = t;
        }
        break;
      case "rest_out":
        if (phase === "working") {
          closeSegment(t);
          phase = "on_break";
          segmentStart = t;
        } else if (phase === "on_break") {
          invalid_break_sequence = true;
        }
        break;
      case "rest_in":
        if (phase === "on_break") {
          closeSegment(t);
          phase = "working";
          segmentStart = t;
        } else {
          invalid_break_sequence = true;
        }
        break;
      case "clock_out":
        if (phase === "on_break") {
          closeSegment(t);
          missing_rest_in = true;
          phase = "outside";
          segmentStart = null;
        } else if (phase === "working") {
          closeSegment(t);
          phase = "outside";
          segmentStart = null;
        }
        lastOutMs = t;
        break;
    }
  }

  const spanMs =
    firstInMs != null && lastOutMs != null
      ? Math.max(0, lastOutMs - firstInMs)
      : workedMs + breakMs;

  return {
    spanMs,
    breakMs,
    workedMs,
    missing_rest_in,
    invalid_break_sequence,
  };
}

/** Sum of actual worked time for the day (rest/break time deducted). */
export function totalWorkedMsForDay(rows: AttendanceRecord[]): number {
  return computeWorkHoursWithBreaks(rows).workedMs;
}

/** Total break time deducted from the day. */
export function breakMsForDay(rows: AttendanceRecord[]): number {
  return computeWorkHoursWithBreaks(rows).breakMs;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0h 0m";
  const totalM = Math.floor(ms / 60000);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return `${h}h ${m}m`;
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function weekRangeMondayStart(weekStartYmd: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysYmd(weekStartYmd, i));
  return days;
}

/** Monday of the week containing `ymd` (local calendar). */
export function mondayOfWeekContaining(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type DayShopStatus = "in_shop" | "out" | "missing_clock_out";

/** In-shop status for a single calendar day (Malaysia date). */
export function dayShopStatusFromRows(
  rows: AttendanceRecord[],
  dateYmd: string,
): DayShopStatus | null {
  const counted = attendanceForTotals(rows);
  if (counted.length === 0) return null;
  const sorted = sortByEventTime(counted);
  const last = sorted[sorted.length - 1];
  if (last.action_type === "clock_out") return "out";
  if (last.action_type === "clock_in") {
    const today = malaysiaDateYmd(new Date());
    return dateYmd === today ? "in_shop" : "missing_clock_out";
  }
  return null;
}

/** Last verified punch still open (clock in without matching out). */
export function punchIssueForDay(rows: AttendanceRecord[]): string | null {
  const counted = attendanceForTotals(rows);
  if (counted.length === 0) return null;
  const sorted = sortByEventTime(counted);
  const last = sorted[sorted.length - 1];
  if (last.action_type === "clock_in") return "Missing clock out";
  return null;
}

export function shopNamesVisited(rows: AttendanceRecord[]): string {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of sortByEventTime(attendanceForTotals(rows))) {
    const n = r.shop_name.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  }
  return order.join(", ") || "—";
}
