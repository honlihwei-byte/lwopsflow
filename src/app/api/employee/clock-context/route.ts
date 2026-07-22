import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import { resolveEmployeeClockContext } from "@/lib/employee-clock-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const url = new URL(req.url);
    const shopOverride = url.searchParams.get("shop_id")?.trim() || null;

    const context = await resolveEmployeeClockContext(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
      requested_shop_id: shopOverride,
    });

    return NextResponse.json(context);
  } catch (e) {
    console.error("[clock-context]", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json(
      {
        resolution: "none" as const,
        today: "",
        allow_unscheduled_clock_in: true,
        accessible_shops: [],
        open_sessions: [],
        assigned_shops: [],
        scheduled_shift: null,
        scheduled_shifts_today: [],
        selected_shop_id: null,
        suggested_shop_id: null,
        can_clock: true,
        block_message: null,
        selected_shop_block_reason: null,
        schedule_lookup_warning: message,
      },
      { status: 200 },
    );
  }
}
