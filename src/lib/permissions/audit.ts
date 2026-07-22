import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export async function logOpsAudit(
  supabase: Supabase,
  params: {
    company_id: string;
    actor_type: "company_admin" | "staff" | "system";
    actor_id?: string | null;
    actor_name: string;
    target_type?: string | null;
    target_id?: string | null;
    action: string;
    old_value?: unknown;
    new_value?: unknown;
    note?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("ops_audit_logs").insert({
    company_id: params.company_id,
    actor_type: params.actor_type,
    actor_id: params.actor_id ?? null,
    actor_name: params.actor_name,
    target_type: params.target_type ?? null,
    target_id: params.target_id ?? null,
    action: params.action,
    old_value: params.old_value ?? null,
    new_value: params.new_value ?? null,
    note: params.note ?? null,
  });
  if (error) console.warn("[ops-audit] insert failed", error.message);
}
