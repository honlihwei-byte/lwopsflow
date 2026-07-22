/**
 * Verifies schedule reads work when schedule_type column is absent (legacy schema).
 * Run: npx --yes tsx scripts/test-schedule-legacy-fallback.ts
 */
import { normalizeScheduleRow, isWorkingShiftScheduleRow } from "../src/lib/shifts/staff-schedules-db";
import { getScheduleType } from "../src/lib/shifts/schedule-type";
import {
  isMissingSchemaColumnError,
  scheduleSelectNeedsLegacyFallback,
} from "../src/lib/shifts/staff-schedules-select";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const legacyShift = {
  id: "1",
  shop_id: "s",
  staff_id: "st",
  shift_date: "2026-06-12",
  start_time: "09:00:00",
  end_time: "18:00:00",
  is_off_day: false,
  status: "active",
};

const normalized = normalizeScheduleRow(legacyShift);
assert(normalized.schedule_type === "SHIFT", "legacy row infers SHIFT");
assert(getScheduleType(normalized) === "SHIFT", "getScheduleType defaults to SHIFT");

const mcLegacy = {
  ...legacyShift,
  start_time: "MC",
  end_time: "MC",
  is_off_day: true,
};
const mcNorm = normalizeScheduleRow(mcLegacy);
assert(mcNorm.schedule_type === "MC", "legacy MC in time columns → MC");
assert(!isWorkingShiftScheduleRow(mcLegacy), "MC row is not working shift");

assert(
  scheduleSelectNeedsLegacyFallback({ code: "42703", message: 'column "schedule_type" does not exist' }),
  "detects missing schedule_type",
);
assert(isMissingSchemaColumnError({ message: "column schedule_type does not exist" }, "schedule_type"), "column filter");

console.log("✓ legacy schedule fallback tests passed");
