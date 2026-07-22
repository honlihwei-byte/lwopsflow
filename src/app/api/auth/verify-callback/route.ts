import { NextResponse } from "next/server";
import { syncCompanyEmailVerificationFromAuth } from "@/lib/email-verification-sync";
import { fetchCompanyByAuthUserId, fetchCompanyByEmail } from "@/lib/company-db";
import { createAuthClient } from "@/lib/supabase/auth-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Complete company trial activation after browser Supabase email confirmation. */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing session token." }, { status: 401 });
    }

    const auth = createAuthClient();
    const { data: userData, error: userErr } = await auth.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const admin = createAdminClient();
    const company =
      (await fetchCompanyByAuthUserId(admin, userData.user.id)) ??
      (userData.user.email ? await fetchCompanyByEmail(admin, userData.user.email) : null);

    if (!company) {
      return NextResponse.json({ error: "Company not found for this account." }, { status: 404 });
    }

    const sync = await syncCompanyEmailVerificationFromAuth(admin, company);
    const refreshed =
      sync.company ?? (await fetchCompanyByAuthUserId(admin, userData.user.id)) ?? company;

    const loginId = refreshed.login_id?.trim() || refreshed.code;

    return NextResponse.json({
      ok: true,
      synced: sync.synced,
      login_id: loginId,
      company_id: loginId,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
