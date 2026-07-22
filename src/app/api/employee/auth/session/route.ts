import { NextResponse } from "next/server";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { getEmployeeAccountByStaffId } from "@/lib/employee-accounts-db";
import { ensureStaffPermissionProfile, loadStaffAssignedShops } from "@/lib/permissions/staff-permissions-db";
import { resolveEffectivePermissions } from "@/lib/permissions/resolve";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const session = employeeSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    const supabase = createAdminClient();
    const account = await getEmployeeAccountByStaffId(supabase, session.staffId);
    if (!account || account.status !== "active") {
      return NextResponse.json({ authenticated: false });
    }

    const profile = await ensureStaffPermissionProfile(supabase, {
      company_id: session.companyId,
      staff_id: session.staffId,
    });

    const effective_permissions = resolveEffectivePermissions(profile);

    const [companyResult, assigned_shops] = await Promise.all([
      supabase.from("companies").select("name").eq("id", session.companyId).maybeSingle(),
      loadStaffAssignedShops(supabase, {
        staff_id: session.staffId,
        company_id: session.companyId,
      }),
    ]);

    const company = companyResult.data;

    return NextResponse.json({
      authenticated: true,
      staff_id: session.staffId,
      staff_name: session.staffName,
      company_id: session.companyId,
      company_name: company?.name ?? "",
      role_template: profile.role_template,
      position_id: profile.position_id,
      position_name: profile.position?.name ?? null,
      assigned_shops,
      shop_scope: profile.shop_scope,
      scope_shop_ids: profile.scope_shop_ids,
      assigned_shop_ids: profile.assigned_shop_ids,
      preferred_locale: account.preferred_locale,
      effective_permissions,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ authenticated: false });
  }
}
