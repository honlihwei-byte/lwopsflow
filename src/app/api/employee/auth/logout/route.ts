import { NextResponse } from "next/server";
import { clearEmployeeSessionCookieHeader } from "@/lib/employee-auth";

export async function POST() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearEmployeeSessionCookieHeader() } });
}
