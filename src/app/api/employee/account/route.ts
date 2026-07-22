import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import {
  changeEmployeePassword,
  getEmployeeAccountByStaffId,
  toPublicAccount,
  updateEmployeeAccountContact,
} from "@/lib/employee-accounts-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const account = await getEmployeeAccountByStaffId(supabase, actor.staffId);
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({ account: toPublicAccount(account) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const account = await getEmployeeAccountByStaffId(supabase, actor.staffId);
    if (!account || account.id !== actor.accountId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = await req.json();

    if (body.new_password) {
      const current = String(body.current_password ?? "");
      if (!current) {
        return NextResponse.json({ error: "Current password is required." }, { status: 400 });
      }
      await changeEmployeePassword(
        supabase,
        account.id,
        current,
        String(body.new_password),
      );
    }

    if (
      body.login_email !== undefined ||
      body.login_phone !== undefined ||
      body.preferred_locale !== undefined
    ) {
      const locale = body.preferred_locale;
      await updateEmployeeAccountContact(supabase, account.id, {
        login_email: body.login_email,
        login_phone: body.login_phone,
        preferred_locale:
          locale === "zh" || locale === "ms" || locale === "en" ? locale : undefined,
      });
    }

    const updated = await getEmployeeAccountByStaffId(supabase, actor.staffId);
    return NextResponse.json({ account: updated ? toPublicAccount(updated) : null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
