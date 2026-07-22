import { NextResponse } from "next/server";
import { adminSessionFromRequest } from "@/lib/admin-auth";
import { isNextResponse as isAdminNextResponse, blockSuperAdminFromOps } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess, type CompanyAdminScope } from "@/lib/company-scope";
import {
  isNextResponse as isEmployeeNextResponse,
  requireEmployeeSession,
  type EmployeeActor,
} from "@/lib/employee-api-auth";
import { canAccessShop, hasPermission } from "@/lib/permissions/resolve";
import type { PermissionKey } from "@/lib/permissions/keys";
import { shopIdsForCompany } from "@/lib/company-db";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type OpsScope =
  | { kind: "admin"; companyId: string; companyShopIds: string[]; admin: CompanyAdminScope }
  | { kind: "employee"; companyId: string; companyShopIds: string[]; actor: EmployeeActor };

export async function requireOpsFeatureAccess(
  req: Request,
  supabase: Supabase,
  opts?: { permissions?: PermissionKey[] },
): Promise<OpsScope | NextResponse> {
  const adminSession = adminSessionFromRequest(req);
  if (adminSession?.role === "company_admin" && adminSession.companyId) {
    const block = blockSuperAdminFromOps(adminSession);
    if (block) return block;
    const adminScope = await requireCompanyFeatureAccess(req, supabase);
    if (isAdminNextResponse(adminScope)) return adminScope;
    return {
      kind: "admin",
      companyId: adminScope.companyId,
      companyShopIds: adminScope.companyShopIds,
      admin: adminScope,
    };
  }

  const actor = await requireEmployeeSession(req, supabase);
  if (isEmployeeNextResponse(actor)) return actor;

  if (opts?.permissions?.length) {
    const allowed = opts.permissions.some((key) =>
      hasPermission(actor.permissionProfile, key),
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission for this action.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
  }

  const allShopIds = await shopIdsForCompany(supabase, actor.companyId);
  const companyShopIds = allShopIds.filter((id) =>
    canAccessShop(actor.permissionProfile, id),
  );

  return {
    kind: "employee",
    companyId: actor.companyId,
    companyShopIds,
    actor,
  };
}

export async function assertOpsShopScope(
  supabase: Supabase,
  scope: OpsScope,
  shopId: string,
): Promise<NextResponse | null> {
  if (scope.kind === "admin") {
    const { assertShopScope } = await import("@/lib/company-scope");
    return assertShopScope(supabase, shopId, scope.companyId);
  }
  if (!canAccessShop(scope.actor.permissionProfile, shopId)) {
    return NextResponse.json({ error: "Shop not in your access scope." }, { status: 403 });
  }
  const { assertShopInCompany } = await import("@/lib/company-db");
  const ok = await assertShopInCompany(supabase, shopId, scope.companyId);
  if (!ok) {
    return NextResponse.json({ error: "Shop not in your company." }, { status: 403 });
  }
  return null;
}
