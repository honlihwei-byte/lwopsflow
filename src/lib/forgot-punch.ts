export const FORGOT_PUNCH_REASONS = [
  { value: "forgot_to_punch", label: "Forgot to punch" },
  { value: "phone_issue", label: "Phone issue" },
  { value: "gps_issue", label: "GPS issue" },
  { value: "other", label: "Other" },
] as const;

export type ForgotPunchReason = (typeof FORGOT_PUNCH_REASONS)[number]["value"];
export type ForgotPunchRequestType =
  | "forgot_clock_in"
  | "forgot_clock_out"
  | "forgot_rest_out"
  | "forgot_rest_in";
export type ForgotPunchStatus = "pending" | "approved" | "rejected";

export const FORGOT_PUNCH_REQUEST_TYPES: readonly ForgotPunchRequestType[] = [
  "forgot_clock_in",
  "forgot_clock_out",
  "forgot_rest_out",
  "forgot_rest_in",
] as const;

/** Maps a forgot-punch request type to the attendance action it creates. */
export function forgotPunchActionType(
  t: ForgotPunchRequestType,
): "clock_in" | "clock_out" | "rest_out" | "rest_in" {
  switch (t) {
    case "forgot_clock_in":
      return "clock_in";
    case "forgot_clock_out":
      return "clock_out";
    case "forgot_rest_out":
      return "rest_out";
    case "forgot_rest_in":
      return "rest_in";
  }
}

export type ForgotPunchRequestRow = {
  id: string;
  staff_id: string;
  shop_id: string;
  request_type: ForgotPunchRequestType;
  requested_time: string;
  reason: ForgotPunchReason;
  notes: string | null;
  status: ForgotPunchStatus;
  attendance_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  audit_old_json: unknown;
  audit_new_json: unknown;
  created_at: string;
};

export function forgotPunchTypeLabel(t: ForgotPunchRequestType): string {
  switch (t) {
    case "forgot_clock_in":
      return "Forgot Clock In";
    case "forgot_clock_out":
      return "Forgot Clock Out";
    case "forgot_rest_out":
      return "Forgot Rest Out";
    case "forgot_rest_in":
      return "Forgot Rest In";
  }
}

export function forgotPunchStatusLabel(s: ForgotPunchStatus): string {
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return "Pending";
}

export function parseForgotPunchReason(v: string): ForgotPunchReason | null {
  return FORGOT_PUNCH_REASONS.some((r) => r.value === v) ? (v as ForgotPunchReason) : null;
}

export function parseForgotPunchRequestType(v: string): ForgotPunchRequestType | null {
  return (FORGOT_PUNCH_REQUEST_TYPES as readonly string[]).includes(v)
    ? (v as ForgotPunchRequestType)
    : null;
}
