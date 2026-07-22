import { activateCompanyAfterEmailVerification } from "@/lib/company-activation";
import { fetchCompanyByAuthUserId, fetchCompanyByEmail } from "@/lib/company-db";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createAuthClient, signupEmailRedirectUrl } from "@/lib/supabase/auth-client";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export async function signUpCompanyAuthUser(
  email: string,
  password: string,
): Promise<{ authUserId: string } | { error: string }> {
  const auth = createAuthClient();
  const { data, error } = await auth.auth.signUp({
    email: email.toLowerCase(),
    password,
    options: {
      emailRedirectTo: signupEmailRedirectUrl(),
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return { error: "Email is already registered." };
    }
    return { error: error.message };
  }

  if (!data.user?.id) {
    return { error: "Could not create auth user." };
  }

  return { authUserId: data.user.id };
}

export async function resendSignupVerification(email: string): Promise<{ ok: true } | { error: string }> {
  const auth = createAuthClient();
  const { error } = await auth.auth.resend({
    type: "signup",
    email: email.toLowerCase(),
    options: {
      emailRedirectTo: signupEmailRedirectUrl(),
    },
  });

  if (error) return { error: error.message };
  return { ok: true };
}

export async function isAuthEmailConfirmed(
  admin: AdminSupabase,
  authUserId: string,
): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !data.user) return false;
  return Boolean(data.user.email_confirmed_at);
}

/** Activate trial company when Supabase has confirmed the admin email. */
export async function activateCompanyIfAuthEmailVerified(
  admin: AdminSupabase,
  authUserId: string,
): Promise<{ activated: boolean; login_id?: string }> {
  const company = await fetchCompanyByAuthUserId(admin, authUserId);
  if (!company || company.status !== "pending_email_verification") {
    return { activated: false };
  }

  const confirmed = await isAuthEmailConfirmed(admin, authUserId);
  if (!confirmed) return { activated: false };

  const { login_id } = await activateCompanyAfterEmailVerification(admin, company.id);
  return { activated: true, login_id };
}

export async function activatePendingCompanyByEmail(
  admin: AdminSupabase,
  email: string,
): Promise<{ activated: boolean; login_id?: string }> {
  const company = await fetchCompanyByEmail(admin, email.toLowerCase());
  if (!company?.auth_user_id || company.status !== "pending_email_verification") {
    return { activated: false };
  }
  return activateCompanyIfAuthEmailVerified(admin, company.auth_user_id);
}
