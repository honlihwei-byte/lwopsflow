import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import {
  getStaffNotificationPreferences,
  listPushSubscriptionsForStaff,
  upsertStaffNotificationPreferences,
} from "@/lib/notifications/ops-notifications-db";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const prefs = await getStaffNotificationPreferences(
      supabase,
      actor.staffId,
      actor.companyId,
    );
    const subs = await listPushSubscriptionsForStaff(supabase, actor.staffId);
    return NextResponse.json({
      preferences: prefs,
      subscription_count: subs.length,
      push_available: Boolean(getVapidPublicKey()),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const body = (await req.json()) as Record<string, unknown>;
    await upsertStaffNotificationPreferences(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
      notifications_enabled:
        body.notifications_enabled !== undefined
          ? body.notifications_enabled === true
          : undefined,
      push_enabled:
        body.push_enabled !== undefined ? body.push_enabled === true : undefined,
    });

    const prefs = await getStaffNotificationPreferences(
      supabase,
      actor.staffId,
      actor.companyId,
    );
    return NextResponse.json({ ok: true, preferences: prefs });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
