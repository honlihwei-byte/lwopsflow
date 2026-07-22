import { NextResponse } from "next/server";
import { fetchAttendanceForDay } from "@/lib/attendance-db";
import { isNextResponse, requireEmployeeSession, requireEmployeePermission } from "@/lib/employee-api-auth";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const deny = requireEmployeePermission(actor, "attendance.view_own");
    if (deny) return deny;

    const url = new URL(req.url);
    const from = url.searchParams.get("from")?.trim() || malaysiaDateYmd(new Date());
    const to = url.searchParams.get("to")?.trim() || from;
    const shopId = url.searchParams.get("shop_id")?.trim();

    let query = supabase
      .from("attendance")
      .select(
        "id, shop_id, event_date, event_time, action_type, shops(name), verification_method, review_required",
      )
      .eq("staff_id", actor.staffId)
      .gte("event_date", from)
      .lte("event_date", to)
      .order("event_date", { ascending: false })
      .order("event_time", { ascending: false });

    if (shopId) query = query.eq("shop_id", shopId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r) => {
      const shop = r.shops as { name?: string } | null;
      return {
        id: String(r.id),
        shop_id: String(r.shop_id),
        shop_name: String(shop?.name ?? ""),
        event_date: String(r.event_date),
        event_time: String(r.event_time),
        action_type: String(r.action_type),
        verification_method: r.verification_method != null ? String(r.verification_method) : null,
        review_required: r.review_required === true,
      };
    });

    return NextResponse.json({ attendance: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
