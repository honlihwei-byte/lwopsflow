import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAdminEnvStatus } from "@/lib/supabase/env-status";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

/**
 * GET — verifies env vars and can list shops (count + first row id) using the service role.
 * Does not return any secret values.
 */
export async function GET() {
  const env = getSupabaseAdminEnvStatus();
  if (
    !env.next_public_supabase_url_set ||
    !env.supabase_service_role_key_set
  ) {
    return NextResponse.json({
      ok: false,
      env,
      hint: "Create .env.local in the project root (copy from .env.example) and set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then restart next dev.",
    });
  }
  if (env.url_looks_placeholder || env.service_role_key_looks_placeholder) {
    return NextResponse.json({
      ok: false,
      env,
      hint: "Replace placeholder values in .env.local with your Supabase Project URL and service_role key from Dashboard → Settings → API.",
    });
  }

  try {
    const supabase = createAdminClient();
    const { data, error, count } = await supabase
      .from("shops")
      .select("id, name", { count: "exact" })
      .order("name")
      .limit(5);
    if (error) {
      const msg = error.message ?? "";
      const hint =
        msg.includes("Invalid API key") || msg.includes("JWT")
          ? "The service key was rejected. In Supabase Dashboard → Settings → API Keys, copy a secret key for this project (sb_secret_… or legacy service_role JWT) with no extra spaces, save .env.local, then restart next dev."
          : "Supabase returned an error when reading public.shops. Check table name, schema, and that schema.sql was applied to this project.";
      return NextResponse.json({
        ok: false,
        env,
        shops_probe: bodyFromPostgrest(error),
        hint,
      });
    }
    return NextResponse.json({
      ok: true,
      env,
      shops_count: count ?? (data?.length ?? 0),
      shops_sample: data ?? [],
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      env,
      shops_probe: bodyFromCaught(e),
      hint: "Could not create Supabase client or request failed (invalid URL, wrong key, or network).",
    });
  }
}
