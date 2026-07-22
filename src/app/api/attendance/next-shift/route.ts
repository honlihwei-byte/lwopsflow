import { NextResponse } from "next/server";
import { normalizeAttendanceRecord } from "@/lib/attendance-db";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { matchMultiShiftDay } from "@/lib/shifts/multi-shift-match";
import { normalizeScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { shopSchedulingFromRow } from "@/lib/shop-scheduling";
import { createAdminClient } from "@/lib/supabase/admin";

function hhmm(v: unknown): string {
  const s = String(v ?? "").trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Public (clock page): show work time or next assigned shift for selected staff. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim() ?? "";
    const staffId = url.searchParams.get("staff_id")?.trim() ?? "";
    const staffIdentifier = url.searchParams.get("staff_identifier")?.trim() ?? "";

    if (!shopId) return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    if (!staffId && !staffIdentifier) {
      return NextResponse.json({ schedule: null });
    }

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

    const today = malaysiaDateYmd(new Date());
    const tomorrow = addDays(today, 1);

    if (scheduling.work_time_mode === "fixed") {
      return NextResponse.json({
        mode: "fixed",
        shop_name: shopName,
        today: {
          shift_date: today,
          start_time: scheduling.opening_time,
          end_time: scheduling.closing_time,
          break_minutes: scheduling.break_minutes,
        },
        schedule: {
          shift_date: today,
          start_time: scheduling.opening_time,
          end_time: scheduling.closing_time,
          break_minutes: scheduling.break_minutes,
        },
      });
    }

    const staffCompanyId =
      (staffRes.staff as { company_id?: string | null }).company_id ?? null;
    if (!staffCompanyId) {
      return NextResponse.json({ mode: "shift_based", shop_name: shopName, schedule: null });
    }

    const { data, error } = await supabase
      .from("staff_schedules")
      .select("id, shift_date, start_time, end_time, break_minutes, shop_id, template_id, is_off_day, status, company_id")
      .eq("staff_id", staffRes.staff.id)
      .eq("company_id", staffCompanyId)
      .eq("status", "active")
      .gte("shift_date", today)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(14);

    if (error) {
      return NextResponse.json({ mode: "shift_based", shop_name: shopName, schedule: null });
    }

    const rows = (data ?? []).filter((r) => !r.is_off_day && r.start_time && r.end_time);
    const templateIds = [...new Set(rows.map((r) => String((r as any).template_id ?? "")).filter(Boolean))];
    const templateName = new Map<string, string>();
    if (templateIds.length > 0) {
      const { data: tpls } = await supabase.from("shop_shift_templates").select("id, name").in("id", templateIds);
      for (const t of (tpls ?? []) as Array<Record<string, unknown>>) {
        templateName.set(String(t.id), String(t.name));
      }
    }
    const shopIds = [...new Set(rows.map((r) => String((r as any).shop_id ?? "")).filter(Boolean))];
    const shopNames = new Map<string, string>();
    if (shopIds.length > 0) {
      const { data: srows } = await supabase.from("shops").select("id, name").in("id", shopIds);
      for (const s of (srows ?? []) as Array<Record<string, unknown>>) {
        shopNames.set(String(s.id), String(s.name));
      }
    }

    const todayRows = rows.filter((r) => String((r as any).shift_date) === today);
    const tomorrowRow = rows.find((r) => String((r as any).shift_date) === tomorrow) ?? null;
    const upcoming = rows.find((r) => String((r as any).shift_date) > today) ?? null;

    const mapRow = (row: Record<string, unknown>) => ({
      id: String(row.id),
      shift_date: String(row.shift_date),
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      break_minutes: Number(row.break_minutes ?? 0) || 0,
      shop_id: String(row.shop_id),
      shop_name: shopNames.get(String(row.shop_id)) ?? null,
      shift_name: row.template_id != null ? (templateName.get(String(row.template_id)) ?? null) : null,
    });

    const today_shifts = todayRows.map((r) => ({
      ...mapRow(r as Record<string, unknown>),
      is_current_shop: String((r as any).shop_id) === shopId,
    }));
    const hasCurrentShopShift = today_shifts.some((s) => s.is_current_shop);
    const warning =
      today_shifts.length > 0 && !hasCurrentShopShift
        ? `You are viewing ${shopName} clock page, but your assigned shift today is at ${today_shifts[0]?.shop_name ?? "another shop"}.`
        : null;

    const allTodaySchedules = todayRows.map((r) => normalizeScheduleRow(r as Record<string, unknown>));
    const todayAtShop = allTodaySchedules.filter((r) => r.shop_id === shopId);

    const { data: attRows } = await supabase
      .from("attendance")
      .select("*")
      .eq("staff_id", staffRes.staff.id)
      .eq("event_date", today)
      .order("created_at", { ascending: true });
    const history = (attRows ?? []).map((r) => normalizeAttendanceRecord(r as Record<string, unknown>));

    const multiAll =
      allTodaySchedules.length > 0
        ? matchMultiShiftDay({
            ymd: today,
            schedules: allTodaySchedules,
            history,
          })
        : null;

    const multiShop =
      todayAtShop.length > 0
        ? matchMultiShiftDay({
            ymd: today,
            schedules: todayAtShop,
            history,
            shopIdFilter: shopId,
          })
        : null;

    function statusLabel(st: string | undefined): string {
      if (!st) return "—";
      if (st === "upcoming") return "Upcoming";
      if (st === "completed") return "Completed";
      if (st === "waiting_for_next_shift") return "Waiting for next shift";
      if (st === "in_shift") return "In shift";
      if (st === "open_shift") return "Open shift";
      return st.replace(/_/g, " ");
    }

    const perById = new Map((multiAll?.per_shift ?? []).map((p) => [p.schedule_id, p]));

    const today_shifts_with_status = today_shifts.map((s, idx) => {
      const ps = perById.get(s.id);
      return {
        ...s,
        shift_index: idx + 1,
        shift_status: ps?.status ?? "upcoming",
        status_label: statusLabel(ps?.status),
        actual_clock_in: ps?.actual_clock_in ?? null,
        actual_clock_out: ps?.actual_clock_out ?? null,
      };
    });

    const multi = multiShop ?? multiAll;

    const currentShiftLabel = multi?.status === "completed"
      ? "Completed"
      : multi?.current_shift
        ? `${multi.current_shift.start}–${multi.current_shift.end}`
        : multi?.status === "waiting_for_next_shift"
          ? "Waiting for next shift"
          : null;
    const nextShiftLabel = multi?.next_shift
      ? `${multi.next_shift.start}–${multi.next_shift.end}`
      : "None";

    return NextResponse.json({
      mode: "shift_based",
      shop_name: shopName,
      today_shifts: today_shifts_with_status,
      day_status: multi?.status ?? null,
      current_shift: multi?.current_shift ?? null,
      next_shift: multi?.next_shift ?? null,
      current_shift_label: currentShiftLabel,
      next_shift_label: nextShiftLabel,
      shifts_today: multi?.shifts_today ?? todayAtShop.length,
      warning,
      today: today_shifts[0] ?? null,
      tomorrow: tomorrowRow ? mapRow(tomorrowRow as Record<string, unknown>) : null,
      upcoming: upcoming ? mapRow(upcoming as Record<string, unknown>) : rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null,
      schedule: today_shifts[0]
        ? today_shifts[0]
        : upcoming
          ? mapRow(upcoming as Record<string, unknown>)
          : rows[0]
            ? mapRow(rows[0] as Record<string, unknown>)
            : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
