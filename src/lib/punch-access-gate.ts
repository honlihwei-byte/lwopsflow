import { validatePunchQrToken } from "@/lib/attendance-punch";
import type { EmployeeSession } from "@/lib/employee-auth";

export type PunchAccessVia = "qr" | "employee_session";

/** QR token OR authenticated employee session for the same staff + shop assignment. */
export function validatePunchAccess(params: {
  shopId: string;
  storedToken: string | null | undefined;
  providedQr: unknown;
  employeeSession: EmployeeSession | null;
  staffId: string;
  staffAssignedToShop: boolean;
}): { ok: true; via: PunchAccessVia } | { ok: false; error: string } {
  const qrCheck = validatePunchQrToken(params.shopId, params.storedToken, params.providedQr);
  if (qrCheck.ok) return { ok: true, via: "qr" };

  if (
    params.employeeSession &&
    params.employeeSession.staffId === params.staffId &&
    params.staffAssignedToShop
  ) {
    return { ok: true, via: "employee_session" };
  }

  return qrCheck;
}
