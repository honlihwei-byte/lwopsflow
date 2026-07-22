import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Update selfie upload status after background retries (no auth — clock device). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ attendanceId: string }> },
) {
  const { attendanceId } = await ctx.params;
  try {
    const body = await req.json();
    const shopId = String(body.shop_id ?? "").trim();
    const status = String(body.status ?? "").trim();
    const errorMessage =
      typeof body.error_message === "string" ? body.error_message.slice(0, 400) : null;

    if (!shopId || (status !== "failed" && status !== "pending")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("attendance")
      .select("id, shop_id")
      .eq("id", attendanceId)
      .maybeSingle();

    if (!row || String(row.shop_id) !== shopId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      selfie_upload_status: status,
      last_updated_at: new Date().toISOString(),
    };
    if (status === "failed" && errorMessage) {
      patch.audit_notes = `Selfie upload failed: ${errorMessage}`.slice(0, 500);
    }

    const { error } = await supabase.from("attendance").update(patch).eq("id", attendanceId);
    if (error) {
      if (/selfie_upload_status/i.test(error.message ?? "")) {
        return NextResponse.json({ ok: true, skipped: "column_missing" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, selfie_upload_status: status });
  } catch (e) {
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
