import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { normalizePayrollMode, type PayrollMode } from "@/lib/payroll-mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data, error } = await supabase
      .from("companies")
      .select("payroll_mode")
      .eq("id", scope.companyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    return NextResponse.json({
      payroll_mode: normalizePayrollMode(data?.payroll_mode),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = await req.json();
    const payroll_mode: PayrollMode = normalizePayrollMode(body.payroll_mode);

    const { error } = await supabase
      .from("companies")
      .update({ payroll_mode, updated_at: new Date().toISOString() })
      .eq("id", scope.companyId);

    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    return NextResponse.json({ payroll_mode, message: "Payroll settings saved." });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
