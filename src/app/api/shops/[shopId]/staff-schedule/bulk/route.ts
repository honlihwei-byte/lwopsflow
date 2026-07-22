import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { assignStaffScheduleDay, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { resolveScheduleTypeFromApi } from "@/lib/shifts/schedule-type";
import { listShopShiftTemplates } from "@/lib/shifts/shop-shift-templates-db";
import { createAdminClient } from "@/lib/supabase/admin";

function ymd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("shift_date must be YYYY-MM-DD");
  return s;
}

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
    const staff_ids = Array.isArray(body.staff_ids) ? (body.staff_ids as unknown[]) : [];
    const shift_date = ymd(body.shift_date);
    const schedule_type = resolveScheduleTypeFromApi({
      is_off_day: body.is_off_day === true,
    });
    const is_off_day = schedule_type !== "SHIFT";
    const template_id = String(body.template_id ?? "").trim();

    if (staff_ids.length === 0) {
      return NextResponse.json({ error: "staff_ids is required" }, { status: 400 });
    }

    let start_time: string | null = null;
    let end_time: string | null = null;
    let break_minutes = 0;
    let tplId: string | null = null;

    if (!is_off_day) {
      if (!template_id) {
        return NextResponse.json({ error: "template_id is required for bulk assign" }, { status: 400 });
      }
      const templates = await listShopShiftTemplates(supabase, {
        companyId: scope.companyId,
        shopId,
      });
      const tpl = templates.find((t) => t.id === template_id);
      if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
      start_time = tpl.start_time;
      end_time = tpl.end_time;
      break_minutes = tpl.break_minutes;
      tplId = tpl.id;
    }

    const created: StaffScheduleRow[] = [];
    for (const sidRaw of staff_ids) {
      const staff_id = String(sidRaw ?? "").trim();
      if (!staff_id) continue;
      created.push(
        await assignStaffScheduleDay(supabase, {
          company_id: scope.companyId,
          shop_id: shopId,
          staff_id,
          shift_date,
          schedule_type,
          start_time,
          end_time,
          break_minutes,
          repeat_type: "one_day",
          template_id: tplId,
          is_off_day,
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
