import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { listStaffSchedules, createStaffSchedule, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

function ymd(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${field} must be YYYY-MM-DD`);
  return s;
}

function addDays(ymdStr: string, days: number): string {
  const d = new Date(`${ymdStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Copy previous week schedules into a target week.
 * Input: { week_start: YYYY-MM-DD } (Monday start)
 */
export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const weekStart = ymd(body.week_start, "week_start");
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekStart, -1);

    const prev = await listStaffSchedules(supabase, {
      companyId: scope.companyId,
      from: prevStart,
      to: prevEnd,
      shopId: body.shop_id ? String(body.shop_id) : null,
      staffId: body.staff_id ? String(body.staff_id) : null,
    });

    const created: StaffScheduleRow[] = [];
    for (const row of prev) {
      const offset = Math.round(
        (Date.parse(row.shift_date) - Date.parse(prevStart)) / (24 * 60 * 60 * 1000),
      );
      const targetDate = addDays(weekStart, offset);
      created.push(
        await createStaffSchedule(supabase, {
          company_id: scope.companyId,
          shop_id: row.shop_id,
          staff_id: row.staff_id,
          shift_date: targetDate,
          start_time: row.start_time,
          end_time: row.end_time,
          break_minutes: row.break_minutes,
          repeat_type: "one_day",
          template_id: row.template_id,
          is_off_day: row.is_off_day,
          created_by: scope.session.companyCode ?? null,
          status: "active",
        } as Omit<StaffScheduleRow, "id" | "created_at" | "updated_at">),
      );
    }

    return NextResponse.json({ ok: true, created, from_week_start: weekStart });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

