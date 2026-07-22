import { NextResponse } from "next/server";
import {
  sessionCookieHeader,
  signAdminSession,
  verifySuperAdminPin,
} from "@/lib/admin-auth";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Super Admin PIN only (hidden /super-admin-login). Company admins use /api/auth/company-login. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const pin = String(body.pin ?? "").trim();
    const role = body.role === "super_admin" ? "super_admin" : "company_admin";

    if (role !== "super_admin") {
      return NextResponse.json(
        { error: "Use Company ID and password at /login." },
        { status: 400 },
      );
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 6 digits." }, { status: 400 });
    }

    if (!verifySuperAdminPin(pin)) {
      return NextResponse.json({ error: "Invalid Super Admin PIN." }, { status: 401 });
    }

    const token = signAdminSession({ role: "super_admin" });
    return NextResponse.json(
      { ok: true, role: "super_admin" },
      { headers: { "Set-Cookie": sessionCookieHeader(token) } },
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
