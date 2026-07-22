import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { count, error } = await supabase
      .from("ops_notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scope.companyId)
      .is("read_at", null);

    if (error) throw new Error(error.message);

    return NextResponse.json({ unread: count ?? 0 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
