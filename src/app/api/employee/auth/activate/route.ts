import { NextResponse } from "next/server";
import {
  activateEmployeeAccount,
  previewActivationToken,
} from "@/lib/employee-accounts-db";
import {
  employeeSessionCookieHeader,
  signEmployeeSession,
} from "@/lib/employee-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const preview = await previewActivationToken(supabase, token);
    return NextResponse.json(preview);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token) {
      return NextResponse.json({ error: "Activation token is required." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const account = await activateEmployeeAccount(supabase, token, password);

    const { data: staff } = await supabase
      .from("staff")
      .select("staff_name, status")
      .eq("id", account.staff_id)
      .maybeSingle();
    if (!staff || String(staff.status) !== "active") {
      return NextResponse.json({ error: "Staff account inactive." }, { status: 403 });
    }

    const sessionToken = signEmployeeSession({
      accountId: account.id,
      staffId: account.staff_id,
      companyId: account.company_id,
      staffName: String(staff.staff_name),
    });

    return NextResponse.json(
      {
        ok: true,
        redirect: "/employee/dashboard",
      },
      { headers: { "Set-Cookie": employeeSessionCookieHeader(sessionToken) } },
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
