import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { logOpsAudit } from "@/lib/permissions/audit";
import { listCompanyPositions } from "@/lib/permissions/company-positions-db";
import {
  ROLE_TEMPLATES,
  SHOP_SCOPES,
  type RoleTemplate,
  type ShopScope,
} from "@/lib/permissions/keys";
import { resolveEffectivePermissions } from "@/lib/permissions/resolve";
import { ROLE_TEMPLATE_DEFAULTS } from "@/lib/permissions/templates";
import {
  ensureStaffPermissionProfile,
  loadStaffPermissionProfile,
  saveStaffPermissionProfile,
} from "@/lib/permissions/staff-permissions-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, company_id, staff_name")
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRow || staffRow.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const profile = await ensureStaffPermissionProfile(supabase, {
      company_id: scope.companyId,
      staff_id: staffId,
    });

    const positions = await listCompanyPositions(supabase, scope.companyId);

    return NextResponse.json({
      profile,
      positions,
      effective_permissions: resolveEffectivePermissions(profile),
      template_defaults: ROLE_TEMPLATE_DEFAULTS,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, company_id, staff_name")
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRow || staffRow.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const before = await loadStaffPermissionProfile(supabase, staffId);
    const body = (await req.json()) as Record<string, unknown>;

    const role_template = String(body.role_template ?? before?.role_template ?? "staff") as RoleTemplate;
    const shop_scope = String(body.shop_scope ?? before?.shop_scope ?? "assigned_only") as ShopScope;
    const position_id =
      body.position_id !== undefined
        ? body.position_id
          ? String(body.position_id)
          : null
        : (before?.position_id ?? null);

    if (!ROLE_TEMPLATES.includes(role_template)) {
      return NextResponse.json({ error: "Invalid role_template" }, { status: 400 });
    }
    if (!SHOP_SCOPES.includes(shop_scope)) {
      return NextResponse.json({ error: "Invalid shop_scope" }, { status: 400 });
    }

    const permission_overrides =
      body.permission_overrides && typeof body.permission_overrides === "object"
        ? (body.permission_overrides as Record<string, boolean>)
        : (before?.permission_overrides ?? {});

    const scope_shop_ids = Array.isArray(body.scope_shop_ids)
      ? (body.scope_shop_ids as unknown[]).map((id) => String(id).trim()).filter(Boolean)
      : (before?.scope_shop_ids ?? []);

    const profile = await saveStaffPermissionProfile(supabase, {
      company_id: scope.companyId,
      staff_id: staffId,
      role_template,
      shop_scope,
      permission_overrides,
      scope_shop_ids,
      position_id,
    });

    await logOpsAudit(supabase, {
      company_id: scope.companyId,
      actor_type: "company_admin",
      actor_name: scope.session.companyName ?? "Company Admin",
      target_type: "staff",
      target_id: staffId,
      action: "permission_changed",
      old_value: before,
      new_value: profile,
    });

    return NextResponse.json({
      ok: true,
      profile,
      effective_permissions: resolveEffectivePermissions(profile),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
