import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import { listEmployeeOperationsFeed } from "@/lib/operations-center/db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const url = new URL(req.url);
    const shop_id = url.searchParams.get("shop_id")?.trim() || null;

    const items = await listEmployeeOperationsFeed(supabase, {
      companyId: actor.companyId,
      staffId: actor.staffId,
      shopId: shop_id,
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
