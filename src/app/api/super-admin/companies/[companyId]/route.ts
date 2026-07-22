import { NextResponse } from "next/server";
import { forbiddenAdmin, isNextResponse, requireSuperAdmin } from "@/lib/admin-api-auth";
import { CompanyDeleteError, deleteCompanyPermanently } from "@/lib/company-delete";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

type RouteContext = { params: Promise<{ companyId: string }> };

export async function DELETE(req: Request, context: RouteContext) {
  const session = requireSuperAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const { companyId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const confirm = String(body.confirm ?? "").trim();

    if (confirm !== "DELETE") {
      return NextResponse.json(
        { error: 'Type DELETE to confirm permanent deletion.' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await deleteCompanyPermanently(supabase, companyId);

    return NextResponse.json({
      ok: true,
      message: "Company permanently deleted.",
      company_id: result.companyId,
      auth_user_deleted: result.authDeleted,
    });
  } catch (e) {
    if (e instanceof CompanyDeleteError) {
      if (e.status === 403) return forbiddenAdmin(e.message);
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
