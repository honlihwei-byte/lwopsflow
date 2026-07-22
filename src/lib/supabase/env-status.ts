/**
 * Safe snapshot of Supabase env (no secrets). Used by /api/health/supabase.
 */
export function getSupabaseAdminEnvStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let urlHost: string | null = null;
  let urlLooksPlaceholder = false;
  if (url) {
    try {
      urlHost = new URL(url).host;
      urlLooksPlaceholder =
        url.includes("YOUR_PROJECT") ||
        url.includes("your-project") ||
        url.includes("placeholder.supabase.co");
    } catch {
      urlLooksPlaceholder = true;
    }
  }
  const keyLooksPlaceholder =
    !key ||
    key === "your_service_role_key" ||
    (key.length < 80 &&
      !key.startsWith("sb_secret_") &&
      !key.startsWith("sbp_"));
  return {
    next_public_supabase_url_set: Boolean(url),
    supabase_service_role_key_set: Boolean(key),
    url_host: urlHost,
    url_looks_placeholder: urlLooksPlaceholder,
    service_role_key_looks_placeholder: keyLooksPlaceholder,
  };
}
