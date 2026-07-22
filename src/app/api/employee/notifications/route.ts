import { NextResponse } from "next/server";
import {
  isNextResponse,
  requireEmployeeSession,
} from "@/lib/employee-api-auth";
import {
  countUnreadForStaff,
  listNotificationsForStaff,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/ops-notifications-db";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const url = new URL(req.url);
    const countOnly = url.searchParams.get("count_only") === "true";

    startDevTimer("notification_count");
    const unread = await countUnreadForStaff(supabase, actor.staffId);
    endDevTimer("notification_count");

    if (countOnly) {
      return NextResponse.json({ unread });
    }

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
    );
    const notifications = await listNotificationsForStaff(supabase, actor.staffId, limit);
    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.message,
        message: n.message,
        link_path: n.link_path,
        read_at: n.read_at,
        is_read: n.read_at != null,
        created_at: n.created_at,
      })),
      unread,
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
    const notificationId = String(body.notification_id ?? "").trim();

    if (notificationId === "all") {
      await markAllNotificationsRead(supabase, actor.staffId);
      return NextResponse.json({ ok: true });
    }

    if (!notificationId) {
      return NextResponse.json({ error: "notification_id required" }, { status: 400 });
    }

    await markNotificationRead(supabase, actor.staffId, notificationId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
