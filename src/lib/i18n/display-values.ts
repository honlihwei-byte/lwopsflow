/** UI-only labels for stored database / API enum values. Never changes stored values. */

export type TranslateFn = (key: string) => string;

function lookup(t: TranslateFn, category: string, value: string): string {
  if (!value) return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const key = `display.${category}.${normalized}`;
  const translated = t(key);
  return translated !== key ? translated : value;
}

export function displayStatus(t: TranslateFn, value: string): string {
  return lookup(t, "status", value);
}

export function displayStaffType(t: TranslateFn, value: string): string {
  if (value === "full_time") return t("display.staffType.full_time");
  if (value === "part_time") return t("display.staffType.part_time");
  return lookup(t, "staffType", value);
}

export function displayPlan(t: TranslateFn, value: string): string {
  return lookup(t, "plan", value);
}

export function displayPaymentStatus(t: TranslateFn, value: string): string {
  return lookup(t, "paymentStatus", value);
}

export function displaySubscriptionStatus(t: TranslateFn, value: string): string {
  return lookup(t, "subscriptionStatus", value);
}

export function displayAccountStatus(t: TranslateFn, value: string): string {
  return lookup(t, "accountStatus", value);
}

export function displayAttendanceStatus(t: TranslateFn, value: string): string {
  if (!value) return "";
  return lookup(t, "attendanceStatus", value);
}

export function displayShopSetupStatus(t: TranslateFn, value: "active" | "setup_required"): string {
  if (value === "setup_required") return t("display.shopStatus.setup_required");
  return t("display.shopStatus.active");
}

export function displayShiftStatus(t: TranslateFn, value: string): string {
  return lookup(t, "shiftStatus", value);
}

/** GPS location type slug (main, office, …) — not user-entered names. */
export function displayGpsLocationType(t: TranslateFn, locationType: string): string {
  const key = `shops.detail.locationTypes.${locationType}`;
  const translated = t(key);
  return translated !== key ? translated : locationType;
}

/** Default system GPS point names stored in English; user custom names pass through. */
export function displaySystemGpsLocationName(t: TranslateFn, name: string): string {
  if (name === "Main Entrance") return t("shops.detail.systemLocationNames.main_entrance");
  return name;
}

export function displayPayrollMode(t: TranslateFn, mode: string): string {
  const key = `payroll.modes.${mode}`;
  const translated = t(key);
  return translated !== key ? translated : mode;
}
