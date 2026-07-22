import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { groupActiveSchedulesByCell } from "@/lib/shifts/staff-schedules-dedupe";
import {
  addStaffScheduleShift,
  assignStaffScheduleDay,
  listStaffSchedules,
  type StaffScheduleRow,
} from "@/lib/shifts/staff-schedules-db";
import { createAdminClient } from "@/lib/supabase/admin";

function ymd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("week_start must be YYYY-MM-DD");
  return s;
}

function addDays(ymdStr: string, days: number): string {
  const d = new Date(`${ymdStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Copy previous Mon–Sun week into target week for this shop. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const body = (await req.json()) as Record<string, unknown>;
    const week_start = ymd(body.week_start);
    const prev_start = addDays(week_start, -7);
    const prev_end = addDays(week_start, -1);

    const sourceRows = await listStaffSchedules(supabase, {
      companyId: scope.companyId,
      shopId,
      from: prev_start,
      to: prev_end,
    });

    const cells = groupActiveSchedulesByCell(sourceRows);
    const created: StaffScheduleRow[] = [];

    for (const cellRows of cells) {
      const srcDate = cellRows[0]!.shift_date;
      const offset = Math.round(
        (new Date(`${srcDate}T12:00:00`).getTime() -
          new Date(`${prev_start}T12:00:00`).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      const targetDate = addDays(week_start, offset);

      for (let i = 0; i < cellRows.length; i++) {
        const src = cellRows[i]!;
        const base = {
          company_id: scope.companyId,
          shop_id: shopId,
          staff_id: src.staff_id,
          shift_date: targetDate,
          schedule_type: src.schedule_type,
          start_time: src.start_time,
          end_time: src.end_time,
          break_minutes: src.break_minutes,
          repeat_type: "one_day" as const,
          template_id: src.template_id,
          is_off_day: src.is_off_day,
          created_by: scope.session.companyCode ?? null,
          status: "active" as const,
        };
        created.push(
          i === 0
            ? await assignStaffScheduleDay(
                supabase,
                base as Omit<StaffScheduleRow, "id" | "created_at" | "updated_at">,
              )
            : await addStaffScheduleShift(
                supabase,
                base as Omit<StaffScheduleRow, "id" | "created_at" | "updated_at" | "sequence_no">,
              ),
        );
      }
    }

    return NextResponse.json({ ok: true, copied: created.length, created });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
