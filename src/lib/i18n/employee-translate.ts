export type EmployeeTranslateFn = (key: string) => string;

/** Normalize API / DB status codes for `employee.status.*` keys. */
export function normalizeEmployeeStatusCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Translate a stored status code (never a human label) for employee UI. */
export function translateEmployeeStatus(t: EmployeeTranslateFn, code: string | null | undefined): string {
  if (!code) return t("employee.common.emDash");
  const normalized = normalizeEmployeeStatusCode(code);
  return t(`employee.status.${normalized}`);
}

/** Labels from schedule API may be a time range or a status phrase — translate known phrases only. */
export function translateScheduleDisplayLabel(
  t: EmployeeTranslateFn,
  label: string | null | undefined,
): string {
  if (!label) return t("employee.common.emDash");
  if (/^\d{1,2}:\d{2}[–-]\d{1,2}:\d{2}$/.test(label.trim())) return label;
  const normalized = normalizeEmployeeStatusCode(label);
  const key = `employee.status.${normalized}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return label;
}

export function translateForgotPunchReason(t: EmployeeTranslateFn, reason: string): string {
  return t(`employee.forgotPunch.reason_${reason}`);
}

export function translateForgotPunchType(t: EmployeeTranslateFn, type: string): string {
  return translateEmployeeStatus(t, type);
}

export function translatePunchSuccessToast(
  t: EmployeeTranslateFn,
  actionType: "clock_in" | "clock_out",
): string {
  return actionType === "clock_in"
    ? t("employee.status.clock_in_successful")
    : t("employee.status.clock_out_successful");
}
