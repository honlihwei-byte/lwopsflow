import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import {
  deletePushSubscription,
  savePushSubscription,
  upsertStaffNotificationPreferences,
} from "@/lib/notifications/ops-notifications-db";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  return NextResponse.json({
    vapid_public_key: getVapidPublicKey(),
    push_available: Boolean(getVapidPublicKey()),
  });
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const body = (await req.json()) as Record<string, unknown>;
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.p256dh ?? "").trim();
    const auth = String(body.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    await savePushSubscription(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent") ?? undefined,
    });
    await upsertStaffNotificationPreferences(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
      notifications_enabled: true,
      push_enabled: true,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const body = (await req.json()) as Record<string, unknown>;
    const endpoint = String(body.endpoint ?? "").trim();
    if (endpoint) {
      await deletePushSubscription(supabase, actor.staffId, endpoint);
    }
    await upsertStaffNotificationPreferences(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
      push_enabled: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
