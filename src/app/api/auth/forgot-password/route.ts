import { NextResponse } from "next/server";
import { fetchCompanyByEmail } from "@/lib/company-db";
import { createAuthClient, resetPasswordRedirectUrl } from "@/lib/supabase/auth-client";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Sends Supabase password reset email when email matches a company admin account. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const company = await fetchCompanyByEmail(supabase, email);

    if (company?.email?.toLowerCase() === email && company.auth_user_id) {
      const auth = createAuthClient();
      const { error: resetErr } = await auth.auth.resetPasswordForEmail(email, {
        redirectTo: resetPasswordRedirectUrl(),
      });
      if (resetErr) {
        console.error("resetPasswordForEmail", resetErr);
        return NextResponse.json(
          { error: "Could not send reset email. Please try again later." },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, password reset instructions have been sent. Please check your inbox and spam folder.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
