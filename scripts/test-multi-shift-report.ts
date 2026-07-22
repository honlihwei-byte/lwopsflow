/**
 * Scenario: two shifts same day (11:00–14:00 + 19:00–21:00), punches only for shift 1.
 * Run: npx --yes tsx scripts/test-multi-shift-report.ts
 */
import { matchMultiShiftDay } from "../src/lib/shifts/multi-shift-match";
import type { StaffScheduleRow } from "../src/lib/shifts/staff-schedules-db";
import type { AttendanceRecord } from "../src/lib/attendance";

const ymd = "2025-06-10";
const shopId = "shop-a";

function sched(id: string, start: string, end: string, seq: number): StaffScheduleRow {
  return {
    id,
    staff_id: "staff-1",
    shop_id: shopId,
    shift_date: ymd,
    schedule_type: "SHIFT",
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    break_minutes: 0,
    sequence_no: seq,
    status: "active",
    is_off_day: false,
    created_at: "",
    updated_at: "",
  } as unknown as StaffScheduleRow;
}

function punch(action: "clock_in" | "clock_out", time: string): AttendanceRecord {
  return {
    id: `p-${action}-${time}`,
    staff_id: "staff-1",
    shop_id: shopId,
    action_type: action,
    event_time: `${ymd}T${time}:00+08:00`,
    event_date: ymd,
    created_at: "",
  } as unknown as AttendanceRecord;
}

const schedules = [sched("s1", "11:00", "14:00", 1), sched("s2", "19:00", "21:00", 2)];
const history = [punch("clock_in", "10:55"), punch("clock_out", "14:02")];

const result = matchMultiShiftDay({
  ymd,
  schedules,
  history,
  nowMs: new Date(`${ymd}T22:00:00+08:00`).getTime(),
});

const checks: Array<[string, boolean]> = [
  ["shifts_today = 2", result.shifts_today === 2],
  ["scheduled_label shows both shifts", result.scheduled_label === "11:00–14:00 + 19:00–21:00"],
  ["scheduled hours = 5h (3h + 2h)", result.scheduled_hours_ms === 5 * 60 * 60_000],
  ["attended_shifts = 1", result.attended_shifts === 1],
  ["missed_shifts = 1", result.missed_shifts === 1],
  ["status = partial_attendance", result.status === "partial_attendance"],
  ["shift 1 matched punch in", result.per_shift[0]?.actual_clock_in != null],
  ["shift 2 has no punch", result.per_shift[1]?.actual_clock_in == null],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? "✓" : "✗", label);
  if (!ok) failed += 1;
}

// Single-shift staff unchanged
const single = matchMultiShiftDay({
  ymd,
  schedules: [sched("s1", "09:00", "17:00", 1)],
  history: [punch("clock_in", "08:58"), punch("clock_out", "17:05")],
  nowMs: new Date(`${ymd}T18:00:00+08:00`).getTime(),
});
console.log(single.shifts_today === 1 ? "✓" : "✗", "single-shift staff: shifts_today = 1");
if (single.shifts_today !== 1) failed += 1;

// Future date must be upcoming, not absent/partial
const future = matchMultiShiftDay({
  ymd: "2099-12-31",
  schedules,
  history: [],
  nowMs: Date.now(),
});
console.log(future.status === "upcoming" ? "✓" : "✗", "future date status = upcoming");
if (future.status !== "upcoming") failed += 1;
console.log(future.missed_shifts === 0 ? "✓" : "✗", "future date missed_shifts = 0");
if (future.missed_shifts !== 0) failed += 1;

process.exit(failed > 0 ? 1 : 0);
