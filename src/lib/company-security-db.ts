import type { PostgrestError } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export const COMPANY_SELFIE_SELECT =
  "selfie_proof_mode, selfie_proof_random_percent, random_selfie_enabled, random_selfie_percent" as const;

export const COMPANY_DEVICE_SELECT = "device_enforcement_mode" as const;

export const COMPANY_SECURITY_SELECT = `${COMPANY_SELFIE_SELECT}, ${COMPANY_DEVICE_SELECT}` as const;

export function isMissingColumnError(err: PostgrestError | null): boolean {
  if (!err) return false;
  if (err.code === "42703") return true;
  return /could not find the .* column/i.test(err.message ?? "");
}

export function missingColumnName(err: PostgrestError | null): string | null {
  const m = err?.message?.match(/column ['"]?(\w+)['"]?/i);
  return m?.[1] ?? null;
}

/** Select company security fields; falls back if device_enforcement_mode is not migrated yet. */
export async function selectCompanySecurityRow(
  supabase: Supabase,
  companyId: string,
): Promise<{ data: Record<string, unknown> | null; deviceColumnAvailable: boolean }> {
  const full = await supabase
    .from("companies")
    .select(COMPANY_SECURITY_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (!full.error) {
    return {
      data: (full.data as Record<string, unknown>) ?? null,
      deviceColumnAvailable: true,
    };
  }

  if (!isMissingColumnError(full.error) || missingColumnName(full.error) !== "device_enforcement_mode") {
    throw new Error(full.error.message);
  }

  const selfie = await supabase
    .from("companies")
    .select(COMPANY_SELFIE_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (selfie.error) throw new Error(selfie.error.message);

  return {
    data: (selfie.data as Record<string, unknown>) ?? null,
    deviceColumnAvailable: false,
  };
}

/** Apply company security patch; strips device_enforcement_mode if column is absent. */
export async function updateCompanySecurity(
  supabase: Supabase,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<{ error: PostgrestError | null; deviceColumnAvailable: boolean }> {
  const withUpdated = { ...patch, updated_at: new Date().toISOString() };

  const first = await supabase.from("companies").update(withUpdated).eq("id", companyId);
  if (!first.error) return { error: null, deviceColumnAvailable: true };

  if (
    isMissingColumnError(first.error) &&
    missingColumnName(first.error) === "device_enforcement_mode" &&
    "device_enforcement_mode" in withUpdated
  ) {
    const { device_enforcement_mode: _removed, ...rest } = withUpdated;
    const retry = await supabase.from("companies").update(rest).eq("id", companyId);
    return { error: retry.error, deviceColumnAvailable: false };
  }

  return { error: first.error, deviceColumnAvailable: true };
}
