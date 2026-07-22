import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { buildActivationUrl } from "@/lib/employee-account-tokens";
import { getEmployeeLoginUrl } from "@/lib/app-url";
import {
  adminResetEmployeePassword,
  createPendingEmployeeAccount,
  disableEmployeeLogin,
  enableEmployeeLogin,
  getEmployeeAccountByStaffId,
  issueActivationToken,
  toPublicAccount,
  updateEmployeeAccountContact,
} from "@/lib/employee-accounts-db";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ staffId: string }> };

function activationResponse(activation: { raw_token: string; expires_at: string }) {
  const activation_url = buildActivationUrl(activation.raw_token);
  return {
    activation_url,
    employee_login_url: getEmployeeLoginUrl(),
    activation_expires_at: activation.expires_at,
  };
}

export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const { staffId } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staff } = await supabase
      .from("staff")
      .select("id, company_id")
      .eq("id", staffId)
      .eq("company_id", scope.companyId)
      .maybeSingle();
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const account = await getEmployeeAccountByStaffId(supabase, staffId);
    return NextResponse.json({
      account: account ? toPublicAccount(account) : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { staffId } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staff } = await supabase
      .from("staff")
      .select("id, company_id")
      .eq("id", staffId)
      .eq("company_id", scope.companyId)
      .maybeSingle();
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const existing = await getEmployeeAccountByStaffId(supabase, staffId);
    if (existing) {
      return NextResponse.json({ error: "Employee login already exists." }, { status: 409 });
    }

    const body = await req.json();
    const { account, activation } = await createPendingEmployeeAccount(supabase, {
      staff_id: staffId,
      company_id: scope.companyId,
      login_email: body.login_email ?? null,
      login_phone: body.login_phone ?? null,
      preferred_locale: body.preferred_locale,
    });

    return NextResponse.json({
      account: toPublicAccount(account),
      ...activationResponse(activation),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const { staffId } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const account = await getEmployeeAccountByStaffId(supabase, staffId);
    if (!account || account.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Employee login not found." }, { status: 404 });
    }

    const body = await req.json();
    const action = String(body.action ?? "").trim();

    if (body.password) {
      return NextResponse.json(
        { error: "Admins cannot set employee passwords. Use reset_password or resend_activation." },
        { status: 400 },
      );
    }

    if (action === "reset_password") {
      const activation = await adminResetEmployeePassword(supabase, account.id);
      const updated = await getEmployeeAccountByStaffId(supabase, staffId);
      return NextResponse.json({
        account: updated ? toPublicAccount(updated) : null,
        ...activationResponse(activation),
      });
    }

    if (action === "resend_activation") {
      const activation = await issueActivationToken(supabase, account.id);
      const updated = await getEmployeeAccountByStaffId(supabase, staffId);
      return NextResponse.json({
        account: updated ? toPublicAccount(updated) : null,
        ...activationResponse(activation),
      });
    }

    if (action === "disable") {
      await disableEmployeeLogin(supabase, account.id);
      const updated = await getEmployeeAccountByStaffId(supabase, staffId);
      return NextResponse.json({ account: updated ? toPublicAccount(updated) : null });
    }

    if (action === "enable") {
      const result = await enableEmployeeLogin(supabase, account.id);
      const payload: Record<string, unknown> = {
        account: toPublicAccount(result.account),
      };
      if (result.activation) {
        Object.assign(payload, activationResponse(result.activation));
      }
      return NextResponse.json(payload);
    }

    if (body.login_email !== undefined || body.login_phone !== undefined) {
      const updated = await updateEmployeeAccountContact(supabase, account.id, {
        login_email: body.login_email,
        login_phone: body.login_phone,
      });
      return NextResponse.json({ account: toPublicAccount(updated) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
