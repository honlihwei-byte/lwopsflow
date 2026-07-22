import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { listStaffTrustedDevices } from "@/lib/punch-device-trust-db";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staffRow, error } = await supabase
      .from("staff")
      .select("id, company_id")
      .eq("id", staffId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
    }
    if (!staffRow || staffRow.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const devices = await listStaffTrustedDevices(supabase, staffId);
    return NextResponse.json({ devices });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
