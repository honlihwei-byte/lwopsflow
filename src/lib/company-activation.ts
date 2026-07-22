import {
  DEFAULT_COMPANY_LOGIN_ID,
  generateCompanyCode,
  generateCompanyLoginId,
  trialWindowFromNow,
} from "@/lib/company-auth";
import { ensureTrialSubscription } from "@/lib/billing";
import { fetchCompanyByLoginId } from "@/lib/company-db";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export async function activateCompanyAfterEmailVerification(
  supabase: Supabase,
  companyId: string,
): Promise<{ login_id: string; trial_ends_at: string }> {
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, code, login_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) throw new Error("Company not found");

  let loginId = company.login_id ? String(company.login_id) : "";
  if (!loginId) {
    for (let i = 0; i < 8; i++) {
      const candidate = generateCompanyLoginId();
      if (candidate === DEFAULT_COMPANY_LOGIN_ID) continue;
      const clash = await fetchCompanyByLoginId(supabase, candidate);
      if (!clash) {
        loginId = candidate;
        break;
      }
    }
  }

  if (!loginId) throw new Error("Could not allocate Company ID");

  const trial = trialWindowFromNow();
  const code =
    company.code && String(company.code) !== "PENDING"
      ? String(company.code)
      : generateCompanyCode(String(company.name));

  await supabase
    .from("companies")
    .update({
      login_id: loginId,
      code,
      status: "trial",
      active: true,
      email_verified_at: new Date().toISOString(),
      trial_started_at: trial.trial_started_at,
      trial_ends_at: trial.trial_ends_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  await ensureTrialSubscription(supabase, companyId);

  return { login_id: loginId, trial_ends_at: trial.trial_ends_at };
}
