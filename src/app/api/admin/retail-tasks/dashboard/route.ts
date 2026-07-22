import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { getTaskDashboardStats } from "@/lib/retail-tasks/retail-tasks-db";
import { tickTaskRecurrence } from "@/lib/retail-tasks/task-recurrence";
import { todayYmd } from "@/lib/retail-tasks/task-status";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const date = url.searchParams.get("date")?.trim() || todayYmd();

    await tickTaskRecurrence(supabase, scope.companyId);
    const stats = await getTaskDashboardStats(supabase, scope.companyId, date);
    return NextResponse.json({ date, stats });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
