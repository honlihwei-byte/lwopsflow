import { NextResponse } from "next/server";
import { companyAdminLoginResponse } from "@/lib/company-admin-login-response";
import { fetchCompanyByCompanyIdInput } from "@/lib/company-db";
import { syncCompanyEmailVerificationFromAuth } from "@/lib/email-verification-sync";
import { verifyPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Company ID + password login (legacy; does not use Supabase Auth). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyIdInput = String(body.company_id ?? body.login_id ?? body.company_code ?? "")
      .trim()
      .toUpperCase();
    const password = String(body.password ?? "");

    if (!companyIdInput) {
      return NextResponse.json({ error: "Company ID is required." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    let company = await fetchCompanyByCompanyIdInput(supabase, companyIdInput);
    if (!company) {
      return NextResponse.json({ error: "Invalid company ID or password." }, { status: 401 });
    }

    if (company.status === "pending_email_verification") {
      const sync = await syncCompanyEmailVerificationFromAuth(supabase, company);
      if (sync.company) {
        company = sync.company;
      }
      if (company.status === "pending_email_verification") {
        return NextResponse.json(
          {
            error: "Please verify your email before signing in.",
            redirect: company.email
              ? `/verify-email?email=${encodeURIComponent(company.email)}`
              : "/verify-email",
          },
          { status: 403 },
        );
      }
      const refreshed = await fetchCompanyByCompanyIdInput(supabase, companyIdInput);
      if (refreshed) company = refreshed;
    }

    if (!company.password_hash || !verifyPassword(password, company.password_hash)) {
      return NextResponse.json({ error: "Invalid company ID or password." }, { status: 401 });
    }

    return companyAdminLoginResponse(supabase, company);
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
