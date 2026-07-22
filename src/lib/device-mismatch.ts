import {
  attendanceForTotals,
  sortByEventTime,
  type AttendanceRecord,
  type PunchActionType,
} from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

function deviceKey(row: Pick<AttendanceRecord, "punch_device_id" | "device_fingerprint">): string | null {
  const id = (row.device_fingerprint ?? row.punch_device_id ?? "").trim();
  if (!id || id === "unknown") return null;
  return id;
}

/** Open session clock-in device id for staff on a calendar day (Malaysia). */
export function openSessionClockInDeviceId(rows: AttendanceRecord[]): string | null {
  const sorted = sortByEventTime(attendanceForTotals(rows));
  let lastInDevice: string | null = null;
  for (const r of sorted) {
    if (r.action_type === "clock_in") {
      lastInDevice = deviceKey(r);
    } else if (r.action_type === "clock_out") {
      lastInDevice = null;
    }
  }
  return lastInDevice;
}

export function detectDeviceMismatchFromRows(
  dayRows: AttendanceRecord[],
  punchDeviceId: string | null,
  actionType: PunchActionType,
): boolean {
  if (actionType !== "clock_out") return false;
  const outId = punchDeviceId?.trim();
  if (!outId || outId === "unknown") return false;
  const inId = openSessionClockInDeviceId(dayRows);
  if (!inId) return false;
  return inId !== outId;
}

export async function detectDeviceMismatchForPunch(
  supabase: Supabase,
  params: {
    staffId: string;
    shopId: string;
    actionType: PunchActionType;
    deviceId: string | null;
    eventDate?: string;
  },
): Promise<boolean> {
  if (params.actionType !== "clock_out") return false;
  const outId = params.deviceId?.trim();
  if (!outId || outId === "unknown") return false;

  const ymd = params.eventDate ?? malaysiaDateYmd(new Date());
  const { data, error } = await supabase
    .from("attendance")
    .select("id, action_type, punch_device_id, device_fingerprint, event_time, created_at, event_date")
    .eq("staff_id", params.staffId)
    .eq("shop_id", params.shopId)
    .eq("event_date", ymd)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return false;

  const rows = data as AttendanceRecord[];
  return detectDeviceMismatchFromRows(rows, outId, "clock_out");
}
