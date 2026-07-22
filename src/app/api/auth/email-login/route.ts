import { NextResponse } from "next/server";
import { companyAdminLoginResponse } from "@/lib/company-admin-login-response";
import { fetchCompanyById, fetchCompanyForAuthLogin } from "@/lib/company-db";
import { syncCompanyEmailVerificationFromAuth } from "@/lib/email-verification-sync";
import { createAuthClient } from "@/lib/supabase/auth-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Complete company admin session after client Supabase email/password sign-in. */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const auth = createAuthClient();
    const { data: userData, error: userErr } = await auth.auth.getUser(token);
    if (userErr || !userData.user?.email) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (!userData.user.email_confirmed_at) {
      return NextResponse.json(
        {
          error: "Please verify your email before signing in.",
          redirect: `/verify-email?email=${encodeURIComponent(userData.user.email)}`,
        },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();
    let company = await fetchCompanyForAuthLogin(supabase, {
      authUserId: userData.user.id,
      email: userData.user.email.toLowerCase(),
    });

    if (!company) {
      return NextResponse.json(
        { error: "No company account found for this email." },
        { status: 404 },
      );
    }

    if (company.status === "pending_email_verification") {
      const sync = await syncCompanyEmailVerificationFromAuth(supabase, company);
      if (sync.company) {
        company = sync.company;
      } else {
        const refreshed = await fetchCompanyById(supabase, company.id);
        if (refreshed) company = refreshed;
      }
      if (company.status === "pending_email_verification") {
        return NextResponse.json(
          {
            error: "Please verify your email before signing in.",
            redirect: `/verify-email?email=${encodeURIComponent(userData.user.email)}`,
          },
          { status: 403 },
        );
      }
    }

    return companyAdminLoginResponse(supabase, company);
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
