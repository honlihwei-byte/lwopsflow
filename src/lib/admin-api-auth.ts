import { NextResponse } from "next/server";
import {
  adminSessionFromRequest,
  type AdminSession,
} from "@/lib/admin-auth";

export function unauthorizedAdmin(message = "Admin authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenAdmin(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function requireAdminSession(req: Request): AdminSession | NextResponse {
  const session = adminSessionFromRequest(req);
  if (!session) return unauthorizedAdmin();
  return session;
}

export function requireCompanyAdmin(req: Request): AdminSession | NextResponse {
  const session = requireAdminSession(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "company_admin" || !session.companyId) {
    return forbiddenAdmin("Company Admin access required.");
  }
  return session;
}

export function requireSuperAdmin(req: Request): AdminSession | NextResponse {
  const session = requireAdminSession(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "super_admin") {
    return forbiddenAdmin("Super Admin access required.");
  }
  return session;
}

/** Super Admin must not access operational attendance data. */
export function blockSuperAdminFromOps(session: AdminSession): NextResponse | null {
  if (session.role === "super_admin") {
    return forbiddenAdmin("Super Admin cannot view attendance, staff, or GPS details.");
  }
  return null;
}

export function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}
