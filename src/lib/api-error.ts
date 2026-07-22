export type ApiErrJson = {
  error?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  tableMissing?: boolean;
};

export function formatApiError(j: ApiErrJson): string {
  const msg = j.error ?? j.message ?? "Request failed";
  const extra = [
    j.code && `code: ${j.code}`,
    j.details && `details: ${j.details}`,
    j.hint && `hint: ${j.hint}`,
  ]
    .filter(Boolean)
    .join("\n");
  return extra ? `${msg}\n${extra}` : msg;
}

export async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as ApiErrJson;
    return formatApiError(j);
  } catch {
    return text.trim() || `HTTP ${res.status}`;
  }
}

export function isPostgrestMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "";
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    msg.includes("shop_gps_locations") ||
    msg.includes("schema cache")
  );
}

export const GPS_LOCATIONS_TABLE_MISSING_MSG =
  "GPS locations table is not set up. Run supabase/migrations/009_shop_gps_locations.sql in your Supabase SQL editor, then try again.";
