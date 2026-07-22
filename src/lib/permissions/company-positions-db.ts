import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

/** Job title only — never used for permission resolution. */
export type CompanyPosition = {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  staff_count?: number;
};

const SELECT =
  "id, company_id, name, sort_order, status, created_at, updated_at";

function mapRow(row: Record<string, unknown>): CompanyPosition {
  const statusRaw = String(row.status);
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name),
    sort_order: Number(row.sort_order ?? 0),
    status: statusRaw === "archived" ? "archived" : "active",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listCompanyPositions(
  supabase: Supabase,
  companyId: string,
  opts?: { includeArchived?: boolean },
): Promise<CompanyPosition[]> {
  let q = supabase
    .from("company_positions")
    .select(SELECT)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!opts?.includeArchived) {
    q = q.eq("status", "active");
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const positions = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));

  const { data: counts } = await supabase
    .from("staff_permission_profiles")
    .select("position_id")
    .eq("company_id", companyId);
  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    const pid = row.position_id != null ? String(row.position_id) : "";
    if (!pid) continue;
    countMap.set(pid, (countMap.get(pid) ?? 0) + 1);
  }

  return positions.map((p) => ({ ...p, staff_count: countMap.get(p.id) ?? 0 }));
}

export async function getCompanyPosition(
  supabase: Supabase,
  positionId: string,
  companyId: string,
): Promise<CompanyPosition | null> {
  const { data, error } = await supabase
    .from("company_positions")
    .select(SELECT)
    .eq("id", positionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function createCompanyPosition(
  supabase: Supabase,
  params: { company_id: string; name: string },
): Promise<CompanyPosition> {
  const name = params.name.trim();
  if (!name) throw new Error("Position name is required.");

  const { data, error } = await supabase
    .from("company_positions")
    .insert({
      company_id: params.company_id,
      name,
      based_on_template: "staff",
      shop_scope: "assigned_only",
      default_permissions: {},
      is_system: false,
      sort_order: 50,
      status: "active",
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateCompanyPosition(
  supabase: Supabase,
  params: { id: string; company_id: string; name?: string },
): Promise<CompanyPosition> {
  const existing = await getCompanyPosition(supabase, params.id, params.company_id);
  if (!existing) throw new Error("Position not found");
  if (existing.status === "archived") {
    throw new Error("Archived positions cannot be edited.");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) throw new Error("Position name is required.");
    patch.name = name;
  }

  const { data, error } = await supabase
    .from("company_positions")
    .update(patch)
    .eq("id", params.id)
    .eq("company_id", params.company_id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function archiveCompanyPosition(
  supabase: Supabase,
  positionId: string,
  companyId: string,
): Promise<void> {
  const existing = await getCompanyPosition(supabase, positionId, companyId);
  if (!existing) throw new Error("Position not found");
  if (existing.status === "archived") return;

  const { error } = await supabase
    .from("company_positions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", positionId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** @deprecated Use archiveCompanyPosition */
export async function deactivateCompanyPosition(
  supabase: Supabase,
  positionId: string,
  companyId: string,
): Promise<void> {
  return archiveCompanyPosition(supabase, positionId, companyId);
}

/** Batch load position names for reports and lists. */
export async function loadStaffPositionNames(
  supabase: Supabase,
  companyId: string,
  staffIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (staffIds.length === 0) return out;

  const { data, error } = await supabase
    .from("staff_permission_profiles")
    .select("staff_id, position_id, company_positions(name)")
    .eq("company_id", companyId)
    .in("staff_id", staffIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const cp = row.company_positions as { name?: string } | null;
    if (cp?.name) {
      out.set(String(row.staff_id), String(cp.name));
    }
  }
  return out;
}
