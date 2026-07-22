import { createHmac, timingSafeEqual } from "crypto";

export type EmployeeSession = {
  role: "employee";
  accountId: string;
  staffId: string;
  companyId: string;
  staffName: string;
  exp: number;
};

export const EMPLOYEE_SESSION_COOKIE = "pc_employee_session";
export const EMPLOYEE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  return (
    process.env.EMPLOYEE_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "punch-card-dev-employee-session-secret"
  );
}

export function signEmployeeSession(
  session: Omit<EmployeeSession, "exp" | "role">,
): string {
  const exp = Date.now() + EMPLOYEE_SESSION_TTL_MS;
  const payload: EmployeeSession = { role: "employee", ...session, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseEmployeeSessionToken(
  token: string | null | undefined,
): EmployeeSession | null {
  if (!token?.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as EmployeeSession;
    if (!parsed?.exp || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    if (parsed.role !== "employee") return null;
    if (!parsed.staffId || !parsed.companyId || !parsed.accountId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function employeeSessionFromRequest(req: Request): EmployeeSession | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${EMPLOYEE_SESSION_COOKIE}=([^;]+)`));
  return parseEmployeeSessionToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function employeeSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${EMPLOYEE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(EMPLOYEE_SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearEmployeeSessionCookieHeader(): string {
  return `${EMPLOYEE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function normalizeLoginIdentifier(raw: string): { email?: string; phone?: string } {
  const v = raw.trim();
  if (!v) return {};
  if (v.includes("@")) return { email: v.toLowerCase() };
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 8) return { phone: digits };
  return { email: v.toLowerCase() };
}
