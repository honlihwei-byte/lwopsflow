import type { createAdminClient } from "@/lib/supabase/admin";
import { selectCompanySecurityRow } from "@/lib/company-security-db";
import type { SelfieProofMode } from "@/lib/selfie-proof-policy";
import { normalizeSelfieProofMode } from "@/lib/selfie-proof-policy";

type Supabase = ReturnType<typeof createAdminClient>;

export type AntiBuddyCompanySettings = {
  selfie_proof_mode: SelfieProofMode;
  selfie_proof_random_percent: 0 | 5 | 10 | 20;
  random_selfie_enabled: boolean;
  random_selfie_percent: 0 | 5 | 10 | 20;
  device_enforcement_mode: "allow_warn" | "require_approval" | "block_unknown";
  /** False when DB migration 036/048 not applied — device saves are skipped server-side. */
  device_enforcement_available: boolean;
};

const ALLOWED_PERCENTS = new Set([0, 5, 10, 20]);

export function normalizeSelfiePercent(value: unknown): 0 | 5 | 10 | 20 {
  const n = typeof value === "number" ? value : Number(value);
  if (ALLOWED_PERCENTS.has(n as 0 | 5 | 10 | 20)) return n as 0 | 5 | 10 | 20;
  return 0;
}

export function companyAntiBuddyFromRow(
  data: Record<string, unknown> | null,
  deviceColumnAvailable: boolean,
): AntiBuddyCompanySettings {
  if (!data) {
    return {
      selfie_proof_mode: "off",
      selfie_proof_random_percent: 0,
      random_selfie_enabled: false,
      random_selfie_percent: 0,
      device_enforcement_mode: "allow_warn",
      device_enforcement_available: deviceColumnAvailable,
    };
  }

  const modeRaw = String(data.device_enforcement_mode ?? "allow_warn");
  const device_enforcement_mode: AntiBuddyCompanySettings["device_enforcement_mode"] =
    modeRaw === "require_approval" || modeRaw === "block_unknown" ? modeRaw : "allow_warn";

  return {
    selfie_proof_mode: normalizeSelfieProofMode(data.selfie_proof_mode),
    selfie_proof_random_percent: normalizeSelfiePercent(data.selfie_proof_random_percent),
    random_selfie_enabled: data.random_selfie_enabled === true,
    random_selfie_percent: normalizeSelfiePercent(data.random_selfie_percent),
    device_enforcement_mode,
    device_enforcement_available: deviceColumnAvailable,
  };
}

export async function fetchCompanyAntiBuddySettings(
  supabase: Supabase,
  companyId: string,
): Promise<AntiBuddyCompanySettings> {
  const { data, deviceColumnAvailable } = await selectCompanySecurityRow(supabase, companyId);
  return companyAntiBuddyFromRow(data, deviceColumnAvailable);
}
