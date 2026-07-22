import { NextResponse } from "next/server";
import { fetchCompanyByAuthUserId, fetchCompanyByEmail } from "@/lib/company-db";
import { hashPassword } from "@/lib/password";
import { createAuthClient } from "@/lib/supabase/auth-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Sync companies.password_hash after Supabase Auth password reset (requires active session). */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json();
    const password = String(body.password ?? "");
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const auth = createAuthClient();
    const { data: userData, error: userErr } = await auth.auth.getUser(token);
    if (userErr || !userData.user?.email) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const email = userData.user.email.toLowerCase();
    const supabase = createAdminClient();
    const company =
      (userData.user.id ? await fetchCompanyByAuthUserId(supabase, userData.user.id) : null) ??
      (await fetchCompanyByEmail(supabase, email));

    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    await supabase
      .from("companies")
      .update({
        password_hash: hashPassword(password),
        updated_at: new Date().toISOString(),
      })
      .eq("id", company.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
