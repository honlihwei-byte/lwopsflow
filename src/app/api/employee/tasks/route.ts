import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession, requireEmployeePermission, employeeTaskActor } from "@/lib/employee-api-auth";
import { addDaysYmd } from "@/lib/attendance";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { attachLatestTaskReviews, listRetailTasks } from "@/lib/retail-tasks/retail-tasks-db";
import { tickTaskRecurrence } from "@/lib/retail-tasks/task-recurrence";
import { canViewTask } from "@/lib/retail-tasks/task-permissions";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const deny = requireEmployeePermission(actor, "tasks.view_own");
    if (deny) return deny;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim();
    const today = malaysiaDateYmd(new Date());
    const historyDays = Math.min(
      90,
      Math.max(1, Number.parseInt(url.searchParams.get("history_days") ?? "30", 10) || 30),
    );
    const from = url.searchParams.get("from")?.trim() || addDaysYmd(today, -(historyDays - 1));
    const to = url.searchParams.get("to")?.trim() || url.searchParams.get("date")?.trim() || today;

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }

    startDevTimer("task_list");
    await tickTaskRecurrence(supabase, actor.companyId);

    const rows = await listRetailTasks(supabase, {
      companyId: actor.companyId,
      shopId,
      from,
      to,
      staffId: actor.staffId,
    });

    const visible = rows.filter((t) => canViewTask(t, employeeTaskActor(actor)));
    const tasks = await attachLatestTaskReviews(supabase, visible);
    endDevTimer("task_list");
    return NextResponse.json({ tasks, from, to });
  } catch (e) {
    endDevTimer("task_list");
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
