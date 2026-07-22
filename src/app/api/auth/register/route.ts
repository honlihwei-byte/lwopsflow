import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { fetchCompanyByEmail } from "@/lib/company-db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { signUpCompanyAuthUser } from "@/lib/supabase/auth-company";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyName = String(body.company_name ?? "").trim();
    const ownerName = String(body.owner_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const confirm = String(body.confirm_password ?? body.confirmPassword ?? "");
    const businessType = String(body.business_type ?? "").trim();
    const staffEstimate = String(body.staff_estimate ?? "").trim();
    const country = String(body.country ?? "MY").trim() || "MY";
    const timezone = String(body.timezone ?? "Asia/Kuala_Lumpur").trim() || "Asia/Kuala_Lumpur";

    if (!companyName || !ownerName || !phone || !email || !businessType || !staffEstimate) {
      return NextResponse.json({ error: "All required fields must be filled." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (password !== confirm) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

    const supabase = createAdminClient();
    const existingEmail = await fetchCompanyByEmail(supabase, email);
    if (existingEmail) {
      if (existingEmail.status === "pending_email_verification") {
        return NextResponse.json(
          { error: "Email already registered. Check your inbox or verify below.", pending: true },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Email is already registered." }, { status: 409 });
    }

    const authResult = await signUpCompanyAuthUser(email, password);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 400 });
    }

    const pendingCode = `PENDING-${randomUUID().slice(0, 8).toUpperCase()}`;

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        code: pendingCode,
        login_id: null,
        password_hash: hashPassword(password),
        auth_user_id: authResult.authUserId,
        owner_name: ownerName,
        phone,
        email,
        business_type: businessType,
        staff_estimate: staffEstimate,
        country,
        timezone,
        status: "pending_email_verification",
        active: false,
        admin_pin: "000000",
      })
      .select("id, name")
      .single();

    if (error) {
      await supabase.auth.admin.deleteUser(authResult.authUserId);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    const companyId = String(data.id);

    const { error: cuErr } = await supabase.from("company_users").insert({
      company_id: companyId,
      user_id: authResult.authUserId,
      role: "company_admin",
      email,
      display_name: ownerName,
    });

    if (cuErr) {
      await supabase.from("companies").delete().eq("id", companyId);
      await supabase.auth.admin.deleteUser(authResult.authUserId);
      return NextResponse.json({ error: cuErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pending_verification: true,
      email,
      message: "Check your email for a verification link.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
