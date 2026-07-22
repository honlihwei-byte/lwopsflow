import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("could not find"));
}

/** Apply enrich fields; drops optional columns if the database has not migrated yet. */
export async function applyAttendanceEnrichUpdate(
  supabase: Supabase,
  attendanceId: string,
  updates: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("attendance").update(updates).eq("id", attendanceId);

  if (!error) return { ok: true };

  if (!isMissingColumnError(error.message)) {
    return { ok: false, error: error.message };
  }

  const minimal = { ...updates };
  delete minimal.audit_notes;
  delete minimal.last_updated_at;

  const { error: retryErr } = await supabase
    .from("attendance")
    .update(minimal)
    .eq("id", attendanceId);

  if (retryErr) {
    return { ok: false, error: retryErr.message };
  }
  return { ok: true };
}
