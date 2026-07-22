import { malaysiaDateYmd, malaysiaTimeHms } from "@/lib/malaysia-time";

/** Wall-clock fields stored on each attendance row (Malaysia calendar). */
export type AttendanceEventFields = {
  event_date: string;
  event_time: string;
};

/** Malaysia event_date (YYYY-MM-DD) and event_time (HH:mm:ss) for inserts. */
export function buildAttendanceEventFields(now: Date = new Date()): AttendanceEventFields {
  return {
    event_date: malaysiaDateYmd(now),
    event_time: malaysiaTimeHms(now),
  };
}
