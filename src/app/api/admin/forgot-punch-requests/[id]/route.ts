import { NextResponse } from "next/server";
import { approveForgotPunchRequest } from "@/lib/forgot-punch-approve";
import { forgotPunchStatusLabel, type ForgotPunchRequestRow } from "@/lib/forgot-punch";
import { formatMalaysiaRecordedAt } from "@/lib/malaysia-time";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();
    const reviewedBy =
      typeof body.reviewed_by === "string" && body.reviewed_by.trim()
        ? body.reviewed_by.trim().slice(0, 120)
        : "admin";

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject." }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("forgot_punch_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (row.status !== "pending") {
      return NextResponse.json({ error: "Request is no longer pending." }, { status: 409 });
    }

    const request = row as ForgotPunchRequestRow;
    const deny = await assertShopScope(supabase, request.shop_id, scope.companyId);
    if (deny) return deny;

    if (action === "reject") {
      const reviewedAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("forgot_punch_requests")
        .update({
          status: "rejected",
          reviewed_by: reviewedBy,
          reviewed_at: reviewedAt,
          audit_old_json: { rejected: true },
          audit_new_json: null,
        })
        .eq("id", id)
        .eq("status", "pending");

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        status: "rejected",
        status_label: forgotPunchStatusLabel("rejected"),
      });
    }

    const result = await approveForgotPunchRequest(supabase, request, reviewedBy);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: "approved",
      status_label: forgotPunchStatusLabel("approved"),
      attendance_id: result.attendanceId,
      reviewed_at: formatMalaysiaRecordedAt(new Date().toISOString()),
      audit_old: result.auditOld,
      audit_new: result.auditNew,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
