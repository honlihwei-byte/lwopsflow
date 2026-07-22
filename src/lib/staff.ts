import type { createAdminClient } from "@/lib/supabase/admin";
import { randomStaffCodeSegment } from "@/lib/staff-code";

export type StaffCore = {
  id: string;
  company_id?: string | null;
  staff_name: string;
  staff_code: string;
  staff_type: string;
  id_card_qr_value: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type StaffWithAssignments = StaffCore & {
  shop_ids: string[];
  shop_names: string[];
  has_attendance: boolean;
};

type Supabase = ReturnType<typeof createAdminClient>;

const STAFF_SELECT =
  "id, company_id, staff_name, staff_code, staff_type, id_card_qr_value, status, created_at, updated_at" as const;

export async function allocateStaffCode(supabase: Supabase): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const c = randomStaffCodeSegment(8);
    const { count, error } = await supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("staff_code", c);
    if (error) throw error;
    if ((count ?? 0) === 0) return c;
  }
  throw new Error("Could not allocate unique staff_code");
}

export async function staffIdsWithAttendance(supabase: Supabase): Promise<Set<string>> {
  const { data, error } = await supabase.from("attendance").select("staff_id");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.staff_id as string));
}

function shopNameFromJoin(shops: unknown): string | null {
  if (!shops) return null;
  if (Array.isArray(shops)) {
    const first = shops[0] as { name?: string } | undefined;
    return first?.name?.trim() ?? null;
  }
  const s = shops as { name?: string };
  return s.name?.trim() ?? null;
}

export async function loadAssignmentsByStaff(
  supabase: Supabase,
  staffIds: string[],
): Promise<Map<string, { shop_ids: string[]; shop_names: string[] }>> {
  const map = new Map<string, { shop_ids: string[]; shop_names: string[] }>();
  if (staffIds.length === 0) return map;

  const { data, error } = await supabase
    .from("staff_shop_assignments")
    .select("staff_id, shop_id, shops ( id, name )")
    .in("staff_id", staffIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const staff_id = row.staff_id as string;
    const shop_id = row.shop_id as string;
    const cur = map.get(staff_id) ?? { shop_ids: [], shop_names: [] };
    cur.shop_ids.push(shop_id);
    const name = shopNameFromJoin(row.shops);
    if (name) cur.shop_names.push(name);
    map.set(staff_id, cur);
  }
  return map;
}

export function attachAssignments(
  rows: StaffCore[],
  assignments: Map<string, { shop_ids: string[]; shop_names: string[] }>,
  withPunches: Set<string>,
): StaffWithAssignments[] {
  return rows.map((s) => {
    const a = assignments.get(s.id) ?? { shop_ids: [], shop_names: [] };
    return {
      ...s,
      shop_ids: a.shop_ids,
      shop_names: a.shop_names,
      has_attendance: withPunches.has(s.id),
    };
  });
}

export async function listStaff(
  supabase: Supabase,
  filters: { shopId?: string | null; companyId?: string | null },
): Promise<StaffWithAssignments[]> {
  let staffIdsFilter: string[] | null = null;
  if (filters.shopId) {
    const { data: links, error: linkErr } = await supabase
      .from("staff_shop_assignments")
      .select("staff_id")
      .eq("shop_id", filters.shopId);
    if (linkErr) throw linkErr;
    staffIdsFilter = [...new Set((links ?? []).map((r) => r.staff_id as string))];
    if (staffIdsFilter.length === 0) return [];
  }

  let q = supabase.from("staff").select(STAFF_SELECT).order("staff_name", { ascending: true });
  if (filters.companyId) q = q.eq("company_id", filters.companyId);
  if (staffIdsFilter) q = q.in("id", staffIdsFilter);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as StaffCore[];
  const ids = rows.map((r) => r.id);
  const [assignments, withPunches] = await Promise.all([
    loadAssignmentsByStaff(supabase, ids),
    staffIdsWithAttendance(supabase),
  ]);
  return attachAssignments(rows, assignments, withPunches);
}

export async function isStaffAssignedToShop(
  supabase: Supabase,
  staffId: string,
  shopId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("staff_shop_assignments")
    .select("id")
    .eq("staff_id", staffId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function syncStaffShopAssignments(
  supabase: Supabase,
  staffId: string,
  shopIds: string[],
): Promise<void> {
  const unique = [...new Set(shopIds)];
  const { data: existing, error: exErr } = await supabase
    .from("staff_shop_assignments")
    .select("shop_id")
    .eq("staff_id", staffId);
  if (exErr) throw exErr;

  const existingIds = new Set((existing ?? []).map((r) => r.shop_id as string));
  const toAdd = unique.filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !unique.includes(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("staff_shop_assignments")
      .delete()
      .eq("staff_id", staffId)
      .in("shop_id", toRemove);
    if (error) throw error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("staff_shop_assignments").insert(
      toAdd.map((shop_id) => ({ staff_id: staffId, shop_id })),
    );
    if (error) throw error;
  }
}

export async function resolveStaffByIdentifier(
  supabase: Supabase,
  identifier: string,
): Promise<StaffCore | null> {
  const idNorm = identifier.trim();
  const codeNorm = idNorm.toUpperCase();

  if (!/^[-\w.]+$/i.test(idNorm)) return null;

  const { data: byCode, error: e1 } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("staff_code", codeNorm)
    .maybeSingle();
  if (e1) throw e1;
  if (byCode) return byCode as StaffCore;

  const { data: byCard, error: e2 } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id_card_qr_value", idNorm)
    .maybeSingle();
  if (e2) throw e2;
  return (byCard as StaffCore | null) ?? null;
}

export async function resolveStaffForPunch(
  supabase: Supabase,
  opts: { staffId?: string; staffIdentifier?: string },
): Promise<StaffCore | null> {
  if (opts.staffId) {
    const { data, error } = await supabase
      .from("staff")
      .select(STAFF_SELECT)
      .eq("id", opts.staffId)
      .maybeSingle();
    if (error) throw error;
    return (data as StaffCore | null) ?? null;
  }
  if (opts.staffIdentifier) {
    return resolveStaffByIdentifier(supabase, opts.staffIdentifier);
  }
  return null;
}

export async function listActiveStaffForShop(
  supabase: Supabase,
  shopId: string,
): Promise<Pick<StaffCore, "id" | "staff_name" | "staff_code" | "staff_type">[]> {
  const { data: links, error: linkErr } = await supabase
    .from("staff_shop_assignments")
    .select("staff_id")
    .eq("shop_id", shopId);
  if (linkErr) throw linkErr;

  const staffIds = [...new Set((links ?? []).map((r) => r.staff_id as string))];
  if (staffIds.length === 0) return [];

  const { data, error } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code, staff_type")
    .in("id", staffIds)
    .eq("status", "active")
    .neq("allow_punch", false)
    .order("staff_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function parseShopIds(body: Record<string, unknown>): string[] | null {
  const raw = body.shop_ids;
  if (!Array.isArray(raw)) return null;
  const ids = raw.map((v) => String(v).trim()).filter(Boolean);
  return [...new Set(ids)];
}
