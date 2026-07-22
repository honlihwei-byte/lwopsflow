import { NextResponse } from "next/server";
import { sessionCookieHeader, signAdminSession } from "@/lib/admin-auth";
import { verifyPassword } from "@/lib/password";
import { bodyFromCaught } from "@/lib/supabase/errors";

function superAdminPasswordHash(): string | null {
  return process.env.SUPER_ADMIN_PASSWORD_HASH?.trim() || null;
}

function verifySuperAdminPassword(password: string): boolean {
  const hash = superAdminPasswordHash();
  if (hash) return verifyPassword(password, hash);
  const plain = process.env.SUPER_ADMIN_PASSWORD?.trim() || process.env.SUPER_ADMIN_PIN?.trim();
  return plain != null && password === plain;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = String(body.password ?? "");

    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    if (!verifySuperAdminPassword(password)) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
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
