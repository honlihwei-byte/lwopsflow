import { randomBytes } from "crypto";
import { normalizeCompanyCode, trialEndsAtFromStart } from "@/lib/company";

/** Public company login ID: CMP-XXXXXX (6 hex chars). */
export function generateCompanyLoginId(): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `CMP-${suffix}`;
}

export function normalizeCompanyLoginId(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return "";
  if (t.startsWith("CMP-")) return t;
  if (/^[A-Z0-9]{6}$/.test(t)) return `CMP-${t}`;
  return t;
}

export function isValidCompanyLoginId(loginId: string): boolean {
  return /^CMP-[A-Z0-9]{6}$/.test(normalizeCompanyLoginId(loginId));
}

/** Reserved default tenant login id (migration 025). */
export const DEFAULT_COMPANY_LOGIN_ID = "CMP-000001";

/** Internal company code (distinct from login_id). */
export function generateCompanyCode(companyName: string): string {
  const base = companyName
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 10);
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return normalizeCompanyCode(`${base || "CO"}${suffix}`);
}

export function trialWindowFromNow() {
  const started = new Date();
  return {
    trial_started_at: started.toISOString(),
    trial_ends_at: trialEndsAtFromStart(started).toISOString(),
  };
}
