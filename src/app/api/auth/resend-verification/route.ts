import { NextResponse } from "next/server";
import { fetchCompanyByEmail } from "@/lib/company-db";
import { resendSignupVerification } from "@/lib/supabase/auth-company";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const company = await fetchCompanyByEmail(supabase, email);

    if (company && company.status !== "pending_email_verification") {
      return NextResponse.json({
        ok: true,
        message:
          "Verification email sent. Please check your inbox and spam folder.",
      });
    }

    if (company?.status === "pending_email_verification") {
      const result = await resendSignupVerification(email);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    } else {
      const result = await resendSignupVerification(email);
      if ("error" in result && !result.error.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        "Verification email sent. Please check your inbox and spam folder.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
