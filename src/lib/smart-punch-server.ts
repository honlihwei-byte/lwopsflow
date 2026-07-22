import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import { fetchStaffAttendanceForDayAllShops } from "@/lib/attendance-db";
import type { PunchActionType } from "@/lib/attendance";
import {
  loadForgotPunchVirtualContext,
  virtualClockInForPendingRequest,
} from "@/lib/forgot-punch-virtual";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  DUPLICATE_PREVENTED_AUDIT_PREFIX,
  validateSmartPunch,
  type SmartPunchBlockCode,
} from "@/lib/smart-punch";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type SmartPunchServerBlock = {
  status: 409;
  body: {
    error: string;
    code: SmartPunchBlockCode;
    duplicate_prevented: boolean;
  };
};

/** Result of server-side smart punch enforcement. */
export type SmartPunchServerResult = {
  /** Non-null when the punch is rejected (caller should return this response). */
  block: SmartPunchServerBlock | null;
  /** True when an accepted clock_out happened while still on break. */
  missingRestIn: boolean;
};

export async function enforceSmartPunchOnServer(
  supabase: Supabase,
  params: {
    shopId: string;
    shopName: string;
    staffId: string;
    staffName: string;
    staffCode: string;
    staffType: string;
    actionType: PunchActionType;
  },
): Promise<SmartPunchServerResult> {
  const dayYmd = malaysiaDateYmd(new Date());
  const [staffRows, forgotCtx] = await Promise.all([
    fetchStaffAttendanceForDayAllShops(supabase, {
      date: dayYmd,
      staffId: params.staffId,
    }),
    loadForgotPunchVirtualContext(supabase, {
      staffId: params.staffId,
      shopId: params.shopId,
      dayYmd,
    }),
  ]);
  const virtualClockIn = virtualClockInForPendingRequest(
    staffRows,
    forgotCtx.pending_clock_in,
    params.shopName,
    dayYmd,
  );

  const check = validateSmartPunch(
    params.actionType,
    staffRows,
    params.shopName,
    undefined,
    virtualClockIn,
  );
  if (check.ok) return { block: null, missingRestIn: check.missingRestIn };

  const { event_date, event_time } = buildAttendanceEventFields();
  await supabase.from("attendance").insert({
    shop_id: params.shopId,
    shop_name: params.shopName,
    staff_id: params.staffId,
    staff_name: params.staffName,
    staff_code: params.staffCode,
    staff_type: params.staffType,
    action_type: params.actionType,
    event_date,
    event_time,
    staff_latitude: null,
    staff_longitude: null,
    distance_from_shop_meters: null,
    gps_accuracy_meters: null,
    gps_verified: false,
    gps_verify_tier: "review_required",
    gps_review_required: false,
    review_required: false,
    photo_proof_used: false,
    verification_method: null,
    audit_notes: check.guardNote.slice(0, 500),
  });

  return {
    block: {
      status: 409,
      body: {
        error: check.message,
        code: check.code,
        duplicate_prevented: check.guardNote.startsWith(DUPLICATE_PREVENTED_AUDIT_PREFIX),
      },
    },
    missingRestIn: false,
  };
}
