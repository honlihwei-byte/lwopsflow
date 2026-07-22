import { NextResponse } from "next/server";
import {
  clearEmployeeSessionCookieHeader,
  employeeSessionCookieHeader,
  normalizeLoginIdentifier,
  signEmployeeSession,
} from "@/lib/employee-auth";
import {
  findEmployeeAccountsByLogin,
  verifyEmployeeLogin,
} from "@/lib/employee-accounts-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier ?? body.email ?? body.phone ?? "").trim();
    const password = String(body.password ?? "");
    const accountId = String(body.account_id ?? "").trim();

    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (accountId) {
      const account = await verifyEmployeeLogin(supabase, accountId, password);
      if (!account) {
        return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
      }
      return finishLogin(supabase, account.staff_id, account.id, account.company_id);
    }

    if (!identifier) {
      return NextResponse.json({ error: "Email or phone is required." }, { status: 400 });
    }

    const parsed = normalizeLoginIdentifier(identifier);
    const lookupKey = parsed.email ?? parsed.phone ?? identifier;
    const matches = await findEmployeeAccountsByLogin(supabase, lookupKey);

    if (matches.length === 0) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    if (matches.length > 1) {
      const verified: typeof matches = [];
      for (const m of matches) {
        const ok = await verifyEmployeeLogin(supabase, m.id, password);
        if (ok) verified.push(m);
      }
      if (verified.length === 0) {
        return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
      }
      if (verified.length === 1) {
        const v = verified[0]!;
        return finishLogin(supabase, v.staff_id, v.id, v.company_id);
      }
      return NextResponse.json({
        ok: true,
        choose_company: true,
        companies: verified.map((v) => ({
          account_id: v.id,
          company_id: v.company_id,
          company_name: v.company_name,
          staff_name: v.staff_name,
        })),
      });
    }

    const account = await verifyEmployeeLogin(supabase, matches[0]!.id, password);
    if (!account) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    return finishLogin(supabase, account.staff_id, account.id, account.company_id);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

async function finishLogin(
  supabase: ReturnType<typeof createAdminClient>,
  staffId: string,
  accountId: string,
  companyId: string,
) {
  const { data: staff, error } = await supabase
    .from("staff")
    .select("staff_name, status")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !staff || String(staff.status) !== "active") {
    return NextResponse.json({ error: "Staff account inactive." }, { status: 403 });
  }

  const token = signEmployeeSession({
    accountId,
    staffId,
    companyId,
    staffName: String(staff.staff_name),
  });

  return NextResponse.json(
    {
      ok: true,
      redirect: "/employee/dashboard",
      staff: { id: staffId, name: String(staff.staff_name) },
    },
    { headers: { "Set-Cookie": employeeSessionCookieHeader(token) } },
  );
}

export async function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearEmployeeSessionCookieHeader() } });
}
