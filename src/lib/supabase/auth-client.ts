import { createClient } from "@supabase/supabase-js";
import { getAuthEmailRedirectUrl } from "@/lib/supabase/auth-url";

/** Server-side Supabase client with anon key — Auth sign-up, sign-in, resend, reset. */
export function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for Auth",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function signupEmailRedirectUrl(): string {
  return getAuthEmailRedirectUrl("/auth/callback");
}

export function resetPasswordRedirectUrl(): string {
  return getAuthEmailRedirectUrl("/reset-password");
}
