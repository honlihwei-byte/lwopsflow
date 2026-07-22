import {
  ROLE_TEMPLATES,
  SHOP_SCOPES,
  type RoleTemplate,
  type ShopScope,
} from "@/lib/permissions/keys";
import {
  getCompanyPosition,
  type CompanyPosition,
} from "@/lib/permissions/company-positions-db";
import { ROLE_TEMPLATE_DEFAULTS } from "@/lib/permissions/templates";
import {
  canAccessShop,
  canVerifyTasks,
  resolveEffectivePermissions,
  type StaffPermissionProfile,
} from "@/lib/permissions/resolve";
import { isEligibleTaskVerifier } from "@/lib/permissions/verifier-eligibility";
import { listActiveStaffForShop } from "@/lib/staff";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const PROFILE_SELECT =
  "id, company_id, staff_id, role_template, shop_scope, permission_overrides, position_id, created_at, updated_at";

export type StaffPermissionSummary = {
  position_id: string | null;
  position_name: string | null;
  role_template: RoleTemplate;
  shop_scope: ShopScope;
  effective_permission_count: number;
  can_verify_tasks: boolean;
};

export async function getStaffAssignedShopIds(
  supabase: Supabase,
  staffId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_shop_assignments")
    .select("shop_id")
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.shop_id));
}

export async function loadStaffAssignedShops(
  supabase: Supabase,
  params: { staff_id: string; company_id: string },
): Promise<Array<{ id: string; name: string }>> {
  const assignedIds = await getStaffAssignedShopIds(supabase, params.staff_id);
  if (assignedIds.length === 0) return [];

  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, name")
    .in("id", assignedIds)
    .eq("company_id", params.company_id)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  return (shops ?? []).map((s) => ({ id: String(s.id), name: String(s.name) }));
}

export async function getStaffPermissionScopeShopIds(
  supabase: Supabase,
  staffId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_permission_shops")
    .select("shop_id")
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.shop_id));
}

export async function loadStaffPermissionProfile(
  supabase: Supabase,
  staffId: string,
): Promise<StaffPermissionProfile | null> {
  const { data, error } = await supabase
    .from("staff_permission_profiles")
    .select(PROFILE_SELECT)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [scope_shop_ids, assigned_shop_ids] = await Promise.all([
    getStaffPermissionScopeShopIds(supabase, staffId),
    getStaffAssignedShopIds(supabase, staffId),
  ]);

  const positionId = data.position_id != null ? String(data.position_id) : null;
  let position: CompanyPosition | null = null;
  if (positionId) {
    position = await getCompanyPosition(
      supabase,
      positionId,
      String(data.company_id),
    );
  }

  return {
    staff_id: String(data.staff_id),
    company_id: String(data.company_id),
    role_template: String(data.role_template) as RoleTemplate,
    shop_scope: String(data.shop_scope) as ShopScope,
    permission_overrides:
      (data.permission_overrides as Record<string, boolean> | null) ?? {},
    scope_shop_ids,
    assigned_shop_ids,
    position_id: positionId,
    position,
  };
}

/** Ensure profile exists; create default staff template if missing. */
export async function ensureStaffPermissionProfile(
  supabase: Supabase,
  params: { company_id: string; staff_id: string },
): Promise<StaffPermissionProfile> {
  const existing = await loadStaffPermissionProfile(supabase, params.staff_id);
  if (existing) return existing;

  const { error } = await supabase.from("staff_permission_profiles").insert({
    company_id: params.company_id,
    staff_id: params.staff_id,
    role_template: "staff",
    shop_scope: "assigned_only",
    permission_overrides: {},
    position_id: null,
  });
  if (error) throw new Error(error.message);
  const created = await loadStaffPermissionProfile(supabase, params.staff_id);
  if (!created) throw new Error("Could not create permission profile");
  return created;
}

export async function saveStaffPermissionProfile(
  supabase: Supabase,
  params: {
    company_id: string;
    staff_id: string;
    role_template: RoleTemplate;
    shop_scope: ShopScope;
    permission_overrides: Record<string, boolean>;
    scope_shop_ids: string[];
    position_id?: string | null;
  },
): Promise<StaffPermissionProfile> {
  if (!ROLE_TEMPLATES.includes(params.role_template)) {
    throw new Error("Invalid role_template");
  }
  if (!SHOP_SCOPES.includes(params.shop_scope)) {
    throw new Error("Invalid shop_scope");
  }

  await ensureStaffPermissionProfile(supabase, {
    company_id: params.company_id,
    staff_id: params.staff_id,
  });

  let positionId = params.position_id ?? null;
  if (positionId) {
    const position = await getCompanyPosition(supabase, positionId, params.company_id);
    if (!position) throw new Error("Position not found");
    if (position.status === "archived") {
      throw new Error("Cannot assign an archived position.");
    }
  }

  const { error } = await supabase
    .from("staff_permission_profiles")
    .update({
      role_template: params.role_template,
      shop_scope: params.shop_scope,
      permission_overrides: params.permission_overrides,
      position_id: positionId,
      updated_at: new Date().toISOString(),
    })
    .eq("staff_id", params.staff_id)
    .eq("company_id", params.company_id);
  if (error) throw new Error(error.message);

  await supabase.from("staff_permission_shops").delete().eq("staff_id", params.staff_id);
  if (params.shop_scope === "selected_shops" && params.scope_shop_ids.length > 0) {
    const { error: shopErr } = await supabase.from("staff_permission_shops").insert(
      params.scope_shop_ids.map((shop_id) => ({
        staff_id: params.staff_id,
        shop_id,
      })),
    );
    if (shopErr) throw new Error(shopErr.message);
  }

  const profile = await loadStaffPermissionProfile(supabase, params.staff_id);
  if (!profile) throw new Error("Profile not found after save");
  return profile;
}

export function applyRoleTemplateToOverrides(
  template: RoleTemplate,
): Record<string, boolean> {
  return { ...ROLE_TEMPLATE_DEFAULTS[template].permissions };
}

export async function loadStaffPermissionSummaries(
  supabase: Supabase,
  companyId: string,
  staffIds: string[],
): Promise<Map<string, StaffPermissionSummary>> {
  const out = new Map<string, StaffPermissionSummary>();
  if (staffIds.length === 0) return out;

  const { data, error } = await supabase
    .from("staff_permission_profiles")
    .select("staff_id, role_template, shop_scope, permission_overrides, position_id")
    .eq("company_id", companyId)
    .in("staff_id", staffIds);
  if (error) throw new Error(error.message);

  const positionIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r.position_id != null ? String(r.position_id) : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const positionMap = new Map<string, CompanyPosition>();
  for (const pid of positionIds) {
    const pos = await getCompanyPosition(supabase, pid, companyId);
    if (pos) positionMap.set(pid, pos);
  }

  for (const row of data ?? []) {
    const staffId = String(row.staff_id);
    const positionId = row.position_id != null ? String(row.position_id) : null;
    const position = positionId ? (positionMap.get(positionId) ?? null) : null;
    const profile: StaffPermissionProfile = {
      staff_id: staffId,
      company_id: companyId,
      role_template: String(row.role_template) as RoleTemplate,
      shop_scope: String(row.shop_scope) as ShopScope,
      permission_overrides:
        (row.permission_overrides as Record<string, boolean> | null) ?? {},
      scope_shop_ids: [],
      assigned_shop_ids: [],
      position_id: positionId,
      position,
    };
    const effective = resolveEffectivePermissions(profile);
    const effective_permission_count = Object.values(effective).filter(Boolean).length;
    out.set(staffId, {
      position_id: positionId,
      position_name: position?.name ?? null,
      role_template: profile.role_template,
      shop_scope: profile.shop_scope,
      effective_permission_count,
      can_verify_tasks: canVerifyTasks(profile),
    });
  }

  return out;
}

export type EligibleStaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
  role_template: RoleTemplate;
  other_shop?: boolean;
};

export async function listActiveStaffForCompany(
  supabase: Supabase,
  companyId: string,
): Promise<Array<{ id: string; staff_name: string; staff_code: string; status: string }>> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code, status")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("staff_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    staff_name: String(r.staff_name),
    staff_code: String(r.staff_code),
    status: String(r.status),
  }));
}

export async function listEligibleVerifiers(
  supabase: Supabase,
  params: { company_id: string; shop_id: string },
): Promise<EligibleStaffRow[]> {
  const base = await listEligibleAssignees(supabase, {
    company_id: params.company_id,
    shop_id: params.shop_id,
    include_cross_shop: false,
  });

  const seen = new Set<string>();
  const out: EligibleStaffRow[] = [];

  for (const s of base) {
    const profile = await ensureStaffPermissionProfile(supabase, {
      company_id: params.company_id,
      staff_id: s.id,
    });
    if (!isEligibleTaskVerifier(profile, params.shop_id)) continue;
    seen.add(s.id);
    out.push({ ...s, role_template: profile.role_template });
  }

  const allStaff = await listActiveStaffForCompany(supabase, params.company_id);
  for (const s of allStaff) {
    if (seen.has(s.id)) continue;
    const profile = await ensureStaffPermissionProfile(supabase, {
      company_id: params.company_id,
      staff_id: s.id,
    });
    if (!isEligibleTaskVerifier(profile, params.shop_id)) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      staff_name: s.staff_name,
      staff_code: s.staff_code,
      role_template: profile.role_template,
    });
  }

  out.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  return out;
}

async function addEligibleRow(
  supabase: Supabase,
  out: EligibleStaffRow[],
  seen: Set<string>,
  params: { company_id: string; shop_id: string },
  staff: { id: string; staff_name: string; staff_code: string },
  other_shop: boolean,
): Promise<void> {
  if (seen.has(staff.id)) return;
  seen.add(staff.id);
  const profile = await ensureStaffPermissionProfile(supabase, {
    company_id: params.company_id,
    staff_id: staff.id,
  });
  if (!canAccessShop(profile, params.shop_id)) return;
  out.push({
    id: staff.id,
    staff_name: staff.staff_name,
    staff_code: staff.staff_code,
    role_template: profile.role_template,
    other_shop,
  });
}

export async function listEligibleAssignees(
  supabase: Supabase,
  params: {
    company_id: string;
    shop_id: string;
    task_date?: string;
    include_cross_shop?: boolean;
  },
): Promise<EligibleStaffRow[]> {
  const seen = new Set<string>();
  const out: EligibleStaffRow[] = [];

  const shopStaff = await listActiveStaffForShop(supabase, params.shop_id);
  for (const s of shopStaff) {
    await addEligibleRow(supabase, out, seen, params, s, false);
  }

  if (params.task_date) {
    const { data: scheduled, error } = await supabase
      .from("staff_schedules")
      .select("staff_id")
      .eq("shop_id", params.shop_id)
      .eq("shift_date", params.task_date)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const schedIds = [...new Set((scheduled ?? []).map((r) => String(r.staff_id)))];
    if (schedIds.length > 0) {
      const { data: staffRows } = await supabase
        .from("staff")
        .select("id, staff_name, staff_code")
        .in("id", schedIds)
        .eq("company_id", params.company_id)
        .eq("status", "active");
      for (const s of staffRows ?? []) {
        await addEligibleRow(
          supabase,
          out,
          seen,
          params,
          {
            id: String(s.id),
            staff_name: String(s.staff_name),
            staff_code: String(s.staff_code),
          },
          false,
        );
      }
    }
  }

  if (params.include_cross_shop) {
    const allStaff = await listActiveStaffForCompany(supabase, params.company_id);
    const assignedIds = new Set(shopStaff.map((s) => s.id));
    for (const s of allStaff) {
      if (assignedIds.has(s.id)) continue;
      const profile = await ensureStaffPermissionProfile(supabase, {
        company_id: params.company_id,
        staff_id: s.id,
      });
      if (!canAccessShop(profile, params.shop_id)) continue;
      await addEligibleRow(supabase, out, seen, params, s, true);
    }
  }

  out.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  return out;
}