import { NextResponse } from "next/server";
import { isNextResponse, requireSuperAdmin } from "@/lib/admin-api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function GET(req: Request) {
  const session = requireSuperAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
    const statusFilter = url.searchParams.get("status");

    const supabase = createAdminClient();

    let query = supabase
      .from("stripe_webhook_events")
      .select(
        "id, stripe_event_id, event_type, stripe_customer_id, stripe_subscription_id, company_id, customer_email, processing_status, error_message, created_at, processed_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq("processing_status", statusFilter);
    } else {
      query = query.in("processing_status", ["failed", "received", "processed", "skipped"]);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to load webhook events" }, { status: 500 });
    }

    const { count: failedCount } = await supabase
      .from("stripe_webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "failed");

    return NextResponse.json({
      events: data ?? [],
      failed_count: failedCount ?? 0,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
