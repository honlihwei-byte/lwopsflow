import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStaffSchedule, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

function ymd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("shift_date must be YYYY-MM-DD");
  return s;
}
function hhmm(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(s)) throw new Error(`${field} must be HH:mm`);
  return s.slice(0, 5);
}
function breakMinutes(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(600, Math.round(n));
}

/** Bulk assign same shift to multiple staff for a date (no repeats). */
export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const shop_id = String(body.shop_id ?? "").trim();
    const staff_ids = Array.isArray(body.staff_ids) ? (body.staff_ids as unknown[]) : [];
    const shift_date = ymd(body.shift_date);
    const start_time = hhmm(body.start_time, "start_time");
    const end_time = hhmm(body.end_time, "end_time");
    const break_minutes = breakMinutes(body.break_minutes);

    if (!shop_id || staff_ids.length === 0) {
      return NextResponse.json({ error: "shop_id and staff_ids are required" }, { status: 400 });
    }

    const created: StaffScheduleRow[] = [];
    for (const sidRaw of staff_ids) {
      const staff_id = String(sidRaw ?? "").trim();
      if (!staff_id) continue;
      created.push(
        await createStaffSchedule(supabase, {
          company_id: scope.companyId,
          shop_id,
          staff_id,
          shift_date,
          start_time,
          end_time,
          break_minutes,
          repeat_type: "one_day",
          template_id: null,
          is_off_day: false,
          created_by: scope.session.companyCode ?? null,
          status: "active",
        } as Omit<StaffScheduleRow, "id" | "created_at" | "updated_at">),
      );
    }

    return NextResponse.json({ ok: true, created });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

