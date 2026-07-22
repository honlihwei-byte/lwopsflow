/**
 * Forgot punch pending clock-in must not block rest/clock-out workflow.
 * Run: npx --yes tsx scripts/test-forgot-punch-virtual-clock-in.ts
 */
import assert from "node:assert/strict";
import type { AttendanceRecord } from "../src/lib/attendance";
import type { ForgotPunchRequestRow } from "../src/lib/forgot-punch";
import {
  buildVirtualClockInRecord,
  virtualClockInForPendingRequest,
} from "../src/lib/forgot-punch-virtual";
import { validateSmartPunch } from "../src/lib/smart-punch";
import { buildStaffTodayStatusSummary } from "../src/lib/staff-day-status";

const dayYmd = "2026-06-12";

function punch(
  action: AttendanceRecord["action_type"],
  time: string,
  id: string,
): AttendanceRecord {
  return {
    id,
    shop_id: "shop-1",
    shop_name: "TT10 Tataa",
    staff_id: "staff-1",
    staff_name: "Ali",
    staff_code: "A001",
    staff_type: "full_time",
    action_type: action,
    event_date: dayYmd,
    event_time: time,
    created_at: `${dayYmd}T${time}+08:00`,
  };
}

const pendingRequest: ForgotPunchRequestRow = {
  id: "req-1",
  staff_id: "staff-1",
  shop_id: "shop-1",
  request_type: "forgot_clock_in",
  requested_time: `${dayYmd}T11:00:00+08:00`,
  reason: "forgot_to_punch",
  notes: null,
  status: "pending",
  attendance_id: null,
  reviewed_by: null,
  reviewed_at: null,
  audit_old_json: null,
  audit_new_json: null,
  created_at: `${dayYmd}T11:05:00+08:00`,
};

function runScenario(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

runScenario("pending forgot clock in unlocks rest out / clock out", () => {
  const rows: AttendanceRecord[] = [];
  const virtual = virtualClockInForPendingRequest(rows, pendingRequest, "TT10 Tataa", dayYmd);
  assert.ok(virtual);

  for (const action of ["rest_out", "clock_out"] as const) {
    const check = validateSmartPunch(action, rows, "TT10 Tataa", 5_000, virtual);
    assert.equal(check.ok, true, `expected ${action} allowed`);
  }

  const afterRestOut = [punch("rest_out", "14:00:00", "rest-out-1")];
  const restInCheck = validateSmartPunch("rest_in", afterRestOut, "TT10 Tataa", 5_000, virtual);
  assert.equal(restInCheck.ok, true, "expected rest_in allowed after rest_out");

  const summary = buildStaffTodayStatusSummary(rows, dayYmd, {
    forgotPunchVirtual: { pending_clock_in: pendingRequest, rejected_clock_in: null },
    shopName: "TT10 Tataa",
  });
  assert.equal(summary.status, "pending_clock_in_verification");
  assert.equal(summary.attendance_phase, "working");
  assert.equal(summary.smart_punch_action, "clock_out");
  assert.equal(summary.attendance_issues.missing_clock_in, false);
});

runScenario("rest sequence after virtual clock in at 11:00", () => {
  const rows: AttendanceRecord[] = [];
  const virtual = buildVirtualClockInRecord(pendingRequest, "TT10 Tataa");

  let check = validateSmartPunch("rest_out", rows, "TT10 Tataa", 5_000, virtual);
  assert.equal(check.ok, true);
  rows.push(punch("rest_out", "14:00:00", "rest-out-1"));

  check = validateSmartPunch("rest_in", rows, "TT10 Tataa", 5_000, virtual);
  assert.equal(check.ok, true);
  rows.push(punch("rest_in", "15:00:00", "rest-in-1"));

  check = validateSmartPunch("clock_out", rows, "TT10 Tataa", 5_000, virtual);
  assert.equal(check.ok, true);

  const summary = buildStaffTodayStatusSummary(rows, dayYmd, {
    forgotPunchVirtual: { pending_clock_in: pendingRequest, rejected_clock_in: null },
    shopName: "TT10 Tataa",
  });
  assert.equal(summary.attendance_phase, "working");
});

runScenario("without pending request rest out stays blocked", () => {
  const rows: AttendanceRecord[] = [];
  const check = validateSmartPunch("rest_out", rows, "TT10 Tataa");
  assert.equal(check.ok, false);
  if (check.ok) throw new Error("expected block");
  assert.equal(check.code, "rest_before_clock_in");
});

runScenario("rejected request does not create virtual clock in", () => {
  const rejected: ForgotPunchRequestRow = { ...pendingRequest, status: "rejected" };
  const virtual = virtualClockInForPendingRequest([], rejected, "TT10 Tataa", dayYmd);
  assert.equal(virtual, null);

  const summary = buildStaffTodayStatusSummary([], dayYmd, {
    forgotPunchVirtual: { pending_clock_in: null, rejected_clock_in: rejected },
    shopName: "TT10 Tataa",
  });
  assert.equal(summary.forgot_punch_rejected, true);
  assert.equal(summary.status, "not_clocked_in");
});

console.log("\nAll forgot punch virtual clock-in tests passed.");
