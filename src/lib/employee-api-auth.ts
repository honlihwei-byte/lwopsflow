import { NextResponse } from "next/server";
import { employeeSessionFromRequest, type EmployeeSession } from "@/lib/employee-auth";
import {
  ensureStaffPermissionProfile,
  loadStaffPermissionProfile,
} from "@/lib/permissions/staff-permissions-db";
import { hasPermission, resolveEffectivePermissions } from "@/lib/permissions/resolve";
import type { PermissionKey } from "@/lib/permissions/keys";
import { getEmployeeAccountByStaffId } from "@/lib/employee-accounts-db";
import type { TaskActor } from "@/lib/retail-tasks/task-permissions";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type EmployeeActor = EmployeeSession & {
  permissionProfile: NonNullable<Awaited<ReturnType<typeof loadStaffPermissionProfile>>>;
  effectivePermissions: ReturnType<typeof resolveEffectivePermissions>;
};

export function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export async function requireEmployeeSession(
  req: Request,
  supabase: Supabase,
): Promise<EmployeeActor | NextResponse> {
  const session = employeeSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Employee login required." }, { status: 401 });
  }

  const account = await getEmployeeAccountByStaffId(supabase, session.staffId);
  if (!account || account.status !== "active" || account.id !== session.accountId) {
    return NextResponse.json({ error: "Employee account inactive." }, { status: 403 });
  }

  const { data: staffRow, error: staffErr } = await supabase
    .from("staff")
    .select("id, status, company_id")
    .eq("id", session.staffId)
    .maybeSingle();
  if (staffErr || !staffRow || String(staffRow.status) !== "active") {
    return NextResponse.json({ error: "Staff record inactive." }, { status: 403 });
  }
  if (String(staffRow.company_id) !== session.companyId) {
    return NextResponse.json({ error: "Company mismatch." }, { status: 403 });
  }

  const permissionProfile = await ensureStaffPermissionProfile(supabase, {
    company_id: session.companyId,
    staff_id: session.staffId,
  });

  return {
    ...session,
    permissionProfile,
    effectivePermissions: resolveEffectivePermissions(permissionProfile),
  };
}

export function employeeTaskActor(actor: EmployeeActor): TaskActor {
  return {
    kind: "staff",
    staffId: actor.staffId,
    name: actor.staffName,
    profile: actor.permissionProfile,
  };
}

export function requireEmployeePermission(
  actor: EmployeeActor,
  key: PermissionKey,
): NextResponse | null {
  if (!hasPermission(actor.permissionProfile, key)) {
    return NextResponse.json({ error: "No permission.", code: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}
