import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { findOverlappingShift } from "@/lib/shifts/schedule-overlap";
import {
  cancelStaffSchedule,
  listActiveSchedulesForStaffDay,
  updateStaffSchedule,
} from "@/lib/shifts/staff-schedules-db";
import { createAdminClient } from "@/lib/supabase/admin";

function hhmm(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(s)) throw new Error(`${field} must be HH:mm`);
  return s.slice(0, 5);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shopId: string; scheduleId: string }> },
) {
  const { shopId, scheduleId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const body = (await req.json()) as Record<string, unknown>;
    const start_time = body.start_time != null ? hhmm(body.start_time, "start_time") : undefined;
    const end_time = body.end_time != null ? hhmm(body.end_time, "end_time") : undefined;

    const { data: existing } = await supabase
      .from("staff_schedules")
      .select("id, shop_id, staff_id, shift_date, start_time, end_time")
      .eq("id", scheduleId)
      .maybeSingle();
    if (!existing || String(existing.shop_id) !== shopId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const st = start_time ?? String(existing.start_time ?? "").slice(0, 5);
    const en = end_time ?? String(existing.end_time ?? "").slice(0, 5);
    if (st && en) {
      const others = await listActiveSchedulesForStaffDay(supabase, {
        shop_id: shopId,
        staff_id: String(existing.staff_id),
        shift_date: String(existing.shift_date),
      });
      const overlap = findOverlappingShift(others, st, en, scheduleId);
      if (overlap) {
        return NextResponse.json({ error: "Shift overlaps with existing shift." }, { status: 400 });
      }
    }

    const row = await updateStaffSchedule(supabase, scheduleId, {
      start_time: start_time ?? undefined,
      end_time: end_time ?? undefined,
    });

    const { notifyScheduleUpdated } = await import("@/lib/notifications/task-reminder-engine");
    await notifyScheduleUpdated(supabase, {
      company_id: scope.companyId,
      staff_id: String(existing.staff_id),
      shop_id: shopId,
      schedule_id: scheduleId,
      shift_date: String(existing.shift_date),
      start_time: st,
      end_time: en,
    }).catch(() => {});

    return NextResponse.json({ ok: true, row });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ shopId: string; scheduleId: string }> },
) {
  const { shopId, scheduleId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const { data: existing } = await supabase
      .from("staff_schedules")
      .select("id, shop_id")
      .eq("id", scheduleId)
      .maybeSingle();
    if (!existing || String(existing.shop_id) !== shopId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await cancelStaffSchedule(supabase, scheduleId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
