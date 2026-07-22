import { NextResponse } from "next/server";
import { runTaskReminderEngineForAllCompanies } from "@/lib/notifications/task-reminder-engine";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    await runTaskReminderEngineForAllCompanies(supabase);
    return NextResponse.json({ ok: true, ran_at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
