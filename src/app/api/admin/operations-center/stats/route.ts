import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { getOperationsDashboardStats } from "@/lib/operations-center/db";
import type { OperationsContentType, OperationsStatus } from "@/lib/operations-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shop_id = url.searchParams.get("shop_id")?.trim() || undefined;
    const content_type = url.searchParams.get("content_type")?.trim() as OperationsContentType | undefined;
    const status = url.searchParams.get("status")?.trim() as OperationsStatus | undefined;

    if (shop_id) {
      const deny = await assertShopScope(supabase, shop_id, scope.companyId);
      if (deny) return deny;
    }

    const stats = await getOperationsDashboardStats(supabase, scope.companyId, {
      shop_id,
      content_type,
      status,
    });
    return NextResponse.json({ stats });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
