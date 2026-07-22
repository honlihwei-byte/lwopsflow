import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertOpsShopScope, requireOpsFeatureAccess } from "@/lib/ops-api-auth";
import {
  listEligibleAssignees,
  listEligibleVerifiers,
} from "@/lib/permissions/staff-permissions-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireOpsFeatureAccess(req, supabase, {
      permissions: ["tasks.assign", "tasks.create", "tasks.verify_proof", "tasks.approve"],
    });
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim();
    const role = url.searchParams.get("role")?.trim() ?? "assignee";
    const taskDate = url.searchParams.get("task_date")?.trim() || undefined;
    const includeCrossShop = url.searchParams.get("include_cross_shop") === "true";

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }

    const deny = await assertOpsShopScope(supabase, scope, shopId);
    if (deny) return deny;

    if (role === "verifier") {
      const staff = await listEligibleVerifiers(supabase, {
        company_id: scope.companyId,
        shop_id: shopId,
      });
      return NextResponse.json({ staff });
    }

    const staff = await listEligibleAssignees(supabase, {
      company_id: scope.companyId,
      shop_id: shopId,
      task_date: taskDate,
      include_cross_shop: includeCrossShop,
    });
    return NextResponse.json({ staff });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
