import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStaffSchedule,
  listStaffSchedules,
  type RepeatType,
  type StaffScheduleRow,
} from "@/lib/shifts/staff-schedules-db";

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

function repeatType(v: unknown): RepeatType {
  const s = String(v ?? "one_day");
  if (s === "one_day" || s === "weekly" || s === "bi_weekly" || s === "monthly") return s;
  return "one_day";
}

function breakMinutes(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(600, Math.round(n));
}

function occurrences(
  shiftDate: string,
  repeat: RepeatType,
  count: number,
): string[] {
  const base = new Date(`${shiftDate}T12:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    if (repeat === "one_day") {
      if (i > 0) break;
    } else if (repeat === "weekly") {
      d.setUTCDate(d.getUTCDate() + 7 * i);
    } else if (repeat === "bi_weekly") {
      d.setUTCDate(d.getUTCDate() + 14 * i);
    } else if (repeat === "monthly") {
      d.setUTCMonth(d.getUTCMonth() + i);
    }
    const iso = d.toISOString().slice(0, 10);
    out.push(iso);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const from = ymd(url.searchParams.get("from"));
    const to = ymd(url.searchParams.get("to"));
    const shopId = url.searchParams.get("shop_id");
    const staffId = url.searchParams.get("staff_id");

    const rows = await listStaffSchedules(supabase, {
      companyId: scope.companyId,
      from,
      to,
      shopId: shopId && shopId !== "__all__" ? shopId : null,
      staffId: staffId && staffId !== "__all__" ? staffId : null,
    });

    return NextResponse.json({ rows, from, to });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const shop_id = String(body.shop_id ?? "").trim();
    const staff_id = String(body.staff_id ?? "").trim();
    const shift_date = ymd(body.shift_date);
    const start_time = hhmm(body.start_time, "start_time");
    const end_time = hhmm(body.end_time, "end_time");
    const break_minutes = breakMinutes(body.break_minutes);
    const repeat_type = repeatType(body.repeat_type);
    const created_by = scope.session.companyCode ?? null;

    if (!shop_id || !staff_id) {
      return NextResponse.json({ error: "shop_id and staff_id are required" }, { status: 400 });
    }

    // Materialize repeats as individual dated rows (next ~8 occurrences).
    const dates = occurrences(shift_date, repeat_type, repeat_type === "monthly" ? 6 : 8);
    const created: StaffScheduleRow[] = [];
    for (const d of dates) {
      created.push(
        await createStaffSchedule(supabase, {
          company_id: scope.companyId,
          shop_id,
          staff_id,
          shift_date: d,
          start_time,
          end_time,
          break_minutes,
          repeat_type,
          template_id: null,
          is_off_day: false,
          created_by,
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

