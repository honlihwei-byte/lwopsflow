import { createHmac, timingSafeEqual } from "crypto";
import type { CompanyRecord } from "@/lib/company";
import { normalizeCompanyCode } from "@/lib/company";

export type AdminRole = "super_admin" | "company_admin";

export type AdminSession = {
  role: AdminRole;
  companyId?: string;
  companyCode?: string;
  companyName?: string;
  exp: number;
};

export const ADMIN_SESSION_COOKIE = "pc_admin_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "punch-card-dev-session-secret"
  );
}

export function superAdminPin(): string {
  return process.env.SUPER_ADMIN_PIN?.trim() || process.env.ADMIN_PIN?.trim() || "999999";
}

export function signAdminSession(session: Omit<AdminSession, "exp">): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload: AdminSession = { ...session, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseAdminSessionToken(token: string | null | undefined): AdminSession | null {
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
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSession;
    if (!parsed?.exp || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    if (parsed.role !== "super_admin" && parsed.role !== "company_admin") return null;
    if (parsed.role === "company_admin" && !parsed.companyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function adminSessionFromRequest(req: Request): AdminSession | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${ADMIN_SESSION_COOKIE}=([^;]+)`));
  return parseAdminSessionToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function verifyCompanyAdminPin(company: CompanyRecord, pin: string): boolean {
  const expected = (company.admin_pin ?? process.env.DEFAULT_COMPANY_ADMIN_PIN ?? "520123").trim();
  return pin.trim() === expected;
}

export function verifySuperAdminPin(pin: string): boolean {
  return pin.trim() === superAdminPin();
}

export function findCompanyByCode(
  companies: CompanyRecord[],
  code: string,
): CompanyRecord | undefined {
  const normalized = normalizeCompanyCode(code);
  return companies.find((c) => normalizeCompanyCode(c.code) === normalized);
}
