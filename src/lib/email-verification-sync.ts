import type { CompanyRecord } from "@/lib/company";
import { activateCompanyAfterEmailVerification } from "@/lib/company-activation";
import { fetchCompanyById } from "@/lib/company-db";
import {
  activateCompanyIfAuthEmailVerified,
  activatePendingCompanyByEmail,
  isAuthEmailConfirmed,
} from "@/lib/supabase/auth-company";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type EmailVerificationInfo = {
  email_verified: boolean;
  email_verified_at: string | null;
};

/** Read Supabase Auth confirmation for a linked company admin user. */
export async function getAuthEmailVerificationInfo(
  admin: AdminSupabase,
  authUserId: string,
): Promise<EmailVerificationInfo> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !data.user) {
    return { email_verified: false, email_verified_at: null };
  }
  const at = data.user.email_confirmed_at ?? null;
  return {
    email_verified: Boolean(at),
    email_verified_at: at,
  };
}

/** Combined company row + Auth confirmation (Auth wins when confirmed). */
export async function getCompanyEmailVerificationInfo(
  admin: AdminSupabase,
  company: Pick<CompanyRecord, "auth_user_id" | "email_verified_at" | "email">,
): Promise<EmailVerificationInfo> {
  let email_verified = Boolean(company.email_verified_at);
  let email_verified_at = company.email_verified_at ?? null;

  if (company.auth_user_id) {
    const authInfo = await getAuthEmailVerificationInfo(admin, company.auth_user_id);
    if (authInfo.email_verified) {
      email_verified = true;
      email_verified_at = email_verified_at ?? authInfo.email_verified_at;
    }
  }

  return { email_verified, email_verified_at };
}

/**
 * If Supabase Auth email is confirmed (or company.email_verified_at is set),
 * activate trial for companies still marked pending_email_verification.
 */
export async function syncCompanyEmailVerificationFromAuth(
  admin: AdminSupabase,
  company: CompanyRecord,
): Promise<{ synced: boolean; company: CompanyRecord | null }> {
  if (company.status !== "pending_email_verification") {
    return { synced: false, company };
  }

  if (company.email_verified_at) {
    await activateCompanyAfterEmailVerification(admin, company.id);
    const refreshed = await fetchCompanyById(admin, company.id);
    return { synced: true, company: refreshed };
  }

  if (company.auth_user_id) {
    const confirmed = await isAuthEmailConfirmed(admin, company.auth_user_id);
    if (confirmed) {
      await activateCompanyIfAuthEmailVerified(admin, company.auth_user_id);
      const refreshed = await fetchCompanyById(admin, company.id);
      return { synced: true, company: refreshed };
    }
  }

  if (company.email) {
    const { activated } = await activatePendingCompanyByEmail(admin, company.email);
    if (activated) {
      const refreshed = await fetchCompanyById(admin, company.id);
      return { synced: true, company: refreshed };
    }
  }

  return { synced: false, company };
}

/** Batch sync pending companies (Super Admin list, background repair). */
export async function syncAllPendingEmailVerifications(admin: AdminSupabase): Promise<number> {
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .eq("status", "pending_email_verification");

  if (error || !data?.length) return 0;

  let synced = 0;
  for (const row of data) {
    const company = await fetchCompanyById(admin, String(row.id));
    if (!company) continue;
    const result = await syncCompanyEmailVerificationFromAuth(admin, company);
    if (result.synced) synced += 1;
  }
  return synced;
}
