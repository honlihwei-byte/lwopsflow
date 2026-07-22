import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelStaffSchedule, updateStaffSchedule } from "@/lib/shifts/staff-schedules-db";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ scheduleId: string }> },
) {
  try {
    const { scheduleId } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;

    const updated = await updateStaffSchedule(supabase, scheduleId, {
      shop_id: body.shop_id != null ? String(body.shop_id).trim() : undefined,
      staff_id: body.staff_id != null ? String(body.staff_id).trim() : undefined,
      shift_date: body.shift_date != null ? String(body.shift_date).trim() : undefined,
      start_time: body.start_time != null ? String(body.start_time).trim() : undefined,
      end_time: body.end_time != null ? String(body.end_time).trim() : undefined,
      break_minutes: body.break_minutes != null ? Number(body.break_minutes) : undefined,
      status: body.status != null ? String(body.status) as "active" | "cancelled" : undefined,
    });

    return NextResponse.json({ ok: true, row: updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ scheduleId: string }> },
) {
  try {
    const { scheduleId } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    await cancelStaffSchedule(supabase, scheduleId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

