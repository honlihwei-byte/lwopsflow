import { NextResponse } from "next/server";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { shopSchedulingFromRow } from "@/lib/shop-scheduling";
import { createAdminClient } from "@/lib/supabase/admin";

function ymd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("date must be YYYY-MM-DD");
  return s;
}

function mondayOfWeek(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function hhmm(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim() ?? "";
    const staffId = url.searchParams.get("staff_id")?.trim() ?? "";
    const staffIdentifier = url.searchParams.get("staff_identifier")?.trim() ?? "";
    const week = String(url.searchParams.get("week") ?? "this").trim(); // this|next

    if (!shopId) return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    if (!staffId && !staffIdentifier) return NextResponse.json({ error: "staff is required" }, { status: 400 });

    const supabase = createAdminClient();
    const shopRes = await loadShopForPunch(supabase, shopId);
    if ("error" in shopRes) return NextResponse.json({ error: shopRes.error }, { status: shopRes.status });

    const staffRes = await validateStaffForPunch(supabase, shopId, {
      staffId: staffId || undefined,
      staffIdentifier: staffIdentifier || undefined,
    });
    if ("error" in staffRes) return NextResponse.json({ error: staffRes.error }, { status: staffRes.status });

    const { data: shopRow } = await supabase
      .from("shops")
      .select("id, name, work_time_mode, opening_time, closing_time, break_minutes")
      .eq("id", shopId)
      .maybeSingle();

    const shopName = shopRow?.name ? String(shopRow.name) : shopRes.shop.name;
    const scheduling = shopRow
      ? shopSchedulingFromRow(shopRow as Record<string, unknown>)
      : { work_time_mode: "fixed" as const, opening_time: "10:00", closing_time: "21:00", break_minutes: 60 };

    // Fixed mode: do not show schedule list (frontend hides button); return working hours for display.
    if (scheduling.work_time_mode === "fixed") {
      return NextResponse.json({
        mode: "fixed",
        shop_name: shopName,
        working_hours: {
          start_time: scheduling.opening_time,
          end_time: scheduling.closing_time,
          break_minutes: scheduling.break_minutes,
        },
        days: [],
      });
    }

    const staffCompanyId =
      (staffRes.staff as { company_id?: string | null }).company_id ?? null;
    if (!staffCompanyId) {
      return NextResponse.json({ mode: "shift_based", shop_name: shopName, days: [] });
    }

    const today = malaysiaDateYmd(new Date());
    const base = week === "next" ? addDays(today, 7) : today;
    const start = mondayOfWeek(base);
    const end = addDays(start, 6);

    const { data: shifts, error } = await supabase
      .from("staff_schedules")
      .select("id, shift_date, start_time, end_time, break_minutes, template_id, is_off_day, status, shop_id, company_id")
      .eq("staff_id", staffRes.staff.id)
      .eq("company_id", staffCompanyId)
      .eq("status", "active")
      .gte("shift_date", start)
      .lte("shift_date", end);
    if (error) return NextResponse.json({ error: "Failed to load schedule" }, { status: 500 });

    const rows = (shifts ?? []) as Array<Record<string, unknown>>;
    const byDate = new Map<string, Array<Record<string, unknown>>>();
    const templateIds = new Set<string>();
    const shopIds = new Set<string>();
    for (const r of rows) {
      const d = String(r.shift_date);
      const arr = byDate.get(d) ?? [];
      arr.push(r);
      byDate.set(d, arr);
      const tid = r.template_id != null ? String(r.template_id) : "";
      if (tid) templateIds.add(tid);
      const sid = r.shop_id != null ? String(r.shop_id) : "";
      if (sid) shopIds.add(sid);
    }

    const templateName = new Map<string, string>();
    if (templateIds.size > 0) {
      const { data: tpls } = await supabase
        .from("shop_shift_templates")
        .select("id, name")
        .in("id", [...templateIds]);
      for (const t of (tpls ?? []) as Array<Record<string, unknown>>) {
        templateName.set(String(t.id), String(t.name));
      }
    }

    const shopNameMap = new Map<string, string>();
    if (shopIds.size > 0) {
      const { data: shops } = await supabase
        .from("shops")
        .select("id, name")
        .in("id", [...shopIds]);
      for (const s of (shops ?? []) as Array<Record<string, unknown>>) {
        shopNameMap.set(String(s.id), String(s.name));
      }
    }

    const days: Array<{
      date: string;
      status: "today" | "upcoming" | "completed" | "off_day";
      shifts: Array<{
        shop_id: string;
        shop_name: string | null;
        template_name: string | null;
        start_time: string;
        end_time: string;
        break_minutes: number;
      }>;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const dayRows = (byDate.get(date) ?? []).slice();
      dayRows.sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")));

      const shiftsForDay = dayRows
        .filter((r) => r.is_off_day !== true && r.start_time && r.end_time)
        .map((r) => {
          const sid = String(r.shop_id ?? "");
          const tid = r.template_id != null ? String(r.template_id) : "";
          return {
            shop_id: sid,
            shop_name: shopNameMap.get(sid) ?? null,
            template_name: tid ? templateName.get(tid) ?? null : null,
            start_time: hhmm(r.start_time)!,
            end_time: hhmm(r.end_time)!,
            break_minutes: Number(r.break_minutes ?? 0) || 0,
          };
        });

      const isOff = shiftsForDay.length === 0;

      let status: "today" | "upcoming" | "completed" | "off_day" = "upcoming";
      if (isOff) status = "off_day";
      else if (date === today) status = "today";
      else if (date < today) status = "completed";
      else status = "upcoming";

      days.push({
        date,
        status,
        shifts: shiftsForDay,
      });
    }

    return NextResponse.json({
      mode: "shift_based",
      shop_name: shopName,
      week_start: start,
      week_end: end,
      days,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

