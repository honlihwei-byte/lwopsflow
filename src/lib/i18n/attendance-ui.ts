import type { GpsDisplayStatus } from "@/lib/gps-display-status";
import type { IssueBadgeType } from "@/lib/attendance-report";
import type { RiskBadgeType } from "@/lib/attendance-risk-badges";
import type { DayShopStatus, PunchActionType } from "@/lib/attendance";
import { displayAttendanceStatus } from "./display-values";

type TranslateFn = (key: string) => string;

const PUNCH_ACTION_KEYS: Record<PunchActionType, string> = {
  clock_in: "attendance.punchLog.inAction",
  clock_out: "attendance.punchLog.outAction",
  rest_out: "attendance.punchLog.restOutAction",
  rest_in: "attendance.punchLog.restInAction",
};

/** Translate a punch action type to its display label (Clock In / Clock Out / Rest Out / Rest In). */
export function translatePunchAction(
  t: TranslateFn,
  actionType: PunchActionType | string,
): string {
  const key = PUNCH_ACTION_KEYS[actionType as PunchActionType];
  if (key) return t(key);
  return String(actionType);
}

/** Tailwind chip classes for a punch action type. */
export function punchActionChipClass(actionType: PunchActionType | string): string {
  switch (actionType) {
    case "clock_in":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "clock_out":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    case "rest_out":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "rest_in":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }
}

const GPS_STATUS_KEYS: Record<GpsDisplayStatus, string> = {
  "GPS OK": "attendance.gpsDisplay.gpsOk",
  "Weak GPS": "attendance.gpsDisplay.weakGps",
  "Outside Radius": "attendance.gpsDisplay.outsideRadius",
  "Location Not Available": "attendance.gpsDisplay.locationNotAvailable",
  "Indoor Review": "attendance.gpsDisplay.indoorReview",
  "Expanded Radius": "attendance.gpsDisplay.expandedRadius",
  "Photo Proof": "attendance.gpsDisplay.photoProof",
  "Manual Approved": "attendance.gpsDisplay.manualApproved",
  Rejected: "attendance.gpsDisplay.rejected",
};

const ISSUE_BADGE_KEYS: Record<IssueBadgeType, string> = {
  missing_clock_out: "attendance.issueBadges.missing_clock_out",
  missing_clock_in: "attendance.issueBadges.missing_clock_in",
  missing_punch: "attendance.issueBadges.missing_punch",
  open_shift: "attendance.issueBadges.open_shift",
  weak_indoor: "attendance.issueBadges.weak_indoor",
  expanded_radius: "attendance.issueBadges.expanded_radius",
  review_required: "attendance.issueBadges.review_required",
  rejected_gps: "attendance.issueBadges.rejected_gps",
  photo_proof: "attendance.issueBadges.photo_proof",
  manual_approved: "attendance.issueBadges.manual_approved",
  duplicate_prevented: "attendance.issueBadges.duplicate_prevented",
  duplicate_punch: "attendance.issueBadges.duplicate_punch",
  suspicious_punch_sequence: "attendance.issueBadges.suspicious_punch_sequence",
  trusted_device: "attendance.issueBadges.trusted_device",
  new_device: "attendance.issueBadges.new_device",
  device_mismatch: "attendance.issueBadges.device_mismatch",
  buddy_punch: "attendance.issueBadges.buddy_punch",
  random_selfie: "attendance.issueBadges.random_selfie",
  selfie_proof: "attendance.issueBadges.selfie_proof",
  high_risk: "attendance.issueBadges.high_risk",
};

const RISK_BADGE_KEYS: Record<RiskBadgeType, string> = {
  trusted_device: "attendance.riskBadges.trusted_device",
  new_device: "attendance.riskBadges.new_device",
  device_mismatch: "attendance.riskBadges.device_mismatch",
  buddy_punch: "attendance.riskBadges.buddy_punch",
  weak_gps: "attendance.riskBadges.weak_gps",
  random_selfie: "attendance.riskBadges.random_selfie",
  selfie_proof: "attendance.riskBadges.selfie_proof",
  high_risk: "attendance.riskBadges.high_risk",
};

const SHOP_STATUS_KEYS: Record<DayShopStatus, string> = {
  in_shop: "attendance.shopStatus.inShop",
  out: "attendance.shopStatus.out",
  missing_clock_out: "attendance.shopStatus.missingClockOut",
};

export function translateGpsDisplayStatus(t: TranslateFn, status: GpsDisplayStatus): string {
  return t(GPS_STATUS_KEYS[status]);
}

export function translateIssueBadge(t: TranslateFn, badge: IssueBadgeType, compact?: boolean): string {
  if (compact) {
    const compactKey = `attendance.issueBadges.${badge}_compact`;
    const compactLabel = t(compactKey);
    if (compactLabel !== compactKey) return compactLabel;
  }
  return t(ISSUE_BADGE_KEYS[badge]);
}

export function translateRiskBadge(t: TranslateFn, badge: RiskBadgeType): string {
  return t(RISK_BADGE_KEYS[badge]);
}

export function translateShopStatus(t: TranslateFn, status: DayShopStatus): string {
  return t(SHOP_STATUS_KEYS[status]);
}

export function labelStaffName(t: TranslateFn, name: string, status?: string): string {
  if (status === "inactive") {
    return t("attendance.inactiveStaff").replace("{name}", name);
  }
  return name;
}

export type ReliabilityTier = "excellent" | "good" | "fair" | "poor";

export function translateReliabilityTier(t: TranslateFn, tier: ReliabilityTier): string {
  return t(`attendance.reliability.${tier}`);
}

export type MonthStaffStatusKey = "in_shop" | "out" | "absent" | "review_needed";

export function translateMonthStaffStatus(t: TranslateFn, status: MonthStaffStatusKey): string {
  const keys: Record<MonthStaffStatusKey, string> = {
    in_shop: "attendance.monthStatus.inShop",
    out: "attendance.monthStatus.out",
    absent: "attendance.monthStatus.absent",
    review_needed: "attendance.monthStatus.reviewNeeded",
  };
  return t(keys[status]);
}

export function translateManagerIssueChip(t: TranslateFn, chipKey: string): string {
  const key = `attendance.managerIssues.${chipKey}`;
  const translated = t(key);
  return translated !== key ? translated : chipKey;
}

export function translateShiftPerformanceStatus(t: TranslateFn, status: string): string {
  if (!status) return status;
  const normalized = status.trim().toLowerCase();
  if (normalized === "open_shift") return t("attendance.shiftLabels.openShift");
  if (normalized === "completed") return t("attendance.shiftLabels.closedShift");
  if (normalized === "in_shift") return t("display.attendanceStatus.in_shift");
  if (normalized === "waiting_for_next_shift") {
    return t("display.attendanceStatus.waiting_for_next_shift");
  }
  return displayAttendanceStatus(t, normalized);
}
