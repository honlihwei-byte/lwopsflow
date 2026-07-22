import { NextResponse } from "next/server";
import {
  forgotPunchStatusLabel,
  forgotPunchTypeLabel,
  type ForgotPunchRequestRow,
} from "@/lib/forgot-punch";
import { formatMalaysiaRecordedAt } from "@/lib/malaysia-time";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";
    const shopId = url.searchParams.get("shop_id");
    const staffId = url.searchParams.get("staff_id");

    let query = supabase
      .from("forgot_punch_requests")
      .select(
        `
        id,
        staff_id,
        shop_id,
        request_type,
        requested_time,
        reason,
        notes,
        status,
        attendance_id,
        reviewed_by,
        reviewed_at,
        audit_old_json,
        audit_new_json,
        created_at,
        staff:staff_id ( staff_name, staff_code ),
        shop:shop_id ( name )
      `,
      )
      .in("shop_id", scope.companyShopIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status !== "__all__") query = query.eq("status", status);
    if (shopId && shopId !== "__all__") query = query.eq("shop_id", shopId);
    if (staffId && staffId !== "__all__") query = query.eq("staff_id", staffId);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const staff = r.staff as { staff_name?: string; staff_code?: string } | null;
      const shop = r.shop as { name?: string } | null;
      return {
        id: String(r.id),
        staff_id: String(r.staff_id),
        staff_name: staff?.staff_name ?? "—",
        staff_code: staff?.staff_code ?? "—",
        shop_id: String(r.shop_id),
        shop_name: shop?.name ?? "—",
        request_type: String(r.request_type),
        request_type_label: forgotPunchTypeLabel(
          String(r.request_type) as ForgotPunchRequestRow["request_type"],
        ),
        requested_time: formatMalaysiaRecordedAt(String(r.requested_time)),
        reason: String(r.reason),
        notes: r.notes ? String(r.notes) : null,
        status: String(r.status),
        status_label: forgotPunchStatusLabel(
          String(r.status) as ForgotPunchRequestRow["status"],
        ),
        attendance_id: r.attendance_id ? String(r.attendance_id) : null,
        reviewed_by: r.reviewed_by ? String(r.reviewed_by) : null,
        reviewed_at: r.reviewed_at ? formatMalaysiaRecordedAt(String(r.reviewed_at)) : null,
        created_at: formatMalaysiaRecordedAt(String(r.created_at)),
        audit_old_json: r.audit_old_json ?? null,
        audit_new_json: r.audit_new_json ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
