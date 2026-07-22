import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  countUnreadForCompany,
  listNotificationsForCompany,
} from "@/lib/notifications/ops-notifications-db";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim() || undefined;
    const unreadOnly = url.searchParams.get("unread_only") === "true";
    const countOnly = url.searchParams.get("count_only") === "true";

    startDevTimer("notification_count");
    const unread = await countUnreadForCompany(supabase, scope.companyId);
    endDevTimer("notification_count");

    if (countOnly) {
      return NextResponse.json({ unread });
    }

    const notifications = await listNotificationsForCompany(supabase, scope.companyId, {
      shop_id: shopId,
      limit: unreadOnly ? 200 : 100,
    });

    const rows = unreadOnly
      ? notifications.filter((n) => n.read_at == null)
      : notifications;

    return NextResponse.json({
      notifications: rows.map((n) => ({
        ...n,
        is_read: n.read_at != null,
        recipient_name: n.staff_name,
      })),
      unread,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
