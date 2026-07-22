import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with service_role — SERVER ONLY.
 * Bypasses RLS; must never be imported from Client Components or browser code.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() cannot run in the browser. Use API routes instead.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (key.startsWith("NEXT_PUBLIC_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must not use NEXT_PUBLIC_ prefix");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
