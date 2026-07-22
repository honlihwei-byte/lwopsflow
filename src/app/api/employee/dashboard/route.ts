import { NextResponse } from "next/server";
import { fetchStaffAttendanceForDayAllShops } from "@/lib/attendance-db";
import { isNextResponse, requireEmployeeSession, employeeTaskActor } from "@/lib/employee-api-auth";
import { resolveEmployeeClockContext } from "@/lib/employee-clock-context";
import { countUnreadNotifications } from "@/lib/employee-notifications-db";
import { getEmployeeDashboardOpsSummary } from "@/lib/operations-center/db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { canViewTask } from "@/lib/retail-tasks/task-permissions";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { buildStaffTodayStatusSummary } from "@/lib/staff-day-status";
import { createAdminClient } from "@/lib/supabase/admin";

const DASHBOARD_PENDING_STATUSES = ["pending", "in_progress", "submitted", "rejected"] as const;

export async function GET(req: Request) {
  startDevTimer("employee_dashboard");
  try {
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) {
      endDevTimer("employee_dashboard");
      return actor;
    }

    const clockContext = await resolveEmployeeClockContext(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
    });

    const today = malaysiaDateYmd(new Date());
    const shopId = clockContext.selected_shop_id;

    let todayStatus = null;
    if (shopId) {
      const rows = await fetchStaffAttendanceForDayAllShops(supabase, {
        date: today,
        staffId: actor.staffId,
      });
      todayStatus = buildStaffTodayStatusSummary(rows, today);
    }

    let opsSummary = {
      total_unread: 0,
      total_items: 0,
      recent: [] as Awaited<ReturnType<typeof getEmployeeDashboardOpsSummary>>["recent"],
    };
    try {
      opsSummary = await getEmployeeDashboardOpsSummary(supabase, {
        companyId: actor.companyId,
        staffId: actor.staffId,
      });
    } catch (opsErr) {
      console.warn("operations_center dashboard summary skipped:", opsErr);
    }

    const [taskRows, unread] = await Promise.all([
      shopId
        ? supabase
            .from("retail_tasks")
            .select("id, shop_id, assigned_staff_id, verifier_staff_id, status")
            .eq("company_id", actor.companyId)
            .eq("shop_id", shopId)
            .eq("due_date", today)
            .in("status", [...DASHBOARD_PENDING_STATUSES])
            .or(
              `assigned_staff_id.eq.${actor.staffId},verifier_staff_id.eq.${actor.staffId},assigned_staff_id.is.null`,
            )
        : Promise.resolve({ data: [], error: null }),
      countUnreadNotifications(supabase, actor.staffId),
    ]);

    if (taskRows.error) throw new Error(taskRows.error.message);
    const taskActor = employeeTaskActor(actor);
    const pendingTasks = (taskRows.data ?? []).filter((t) =>
      canViewTask(
        {
          shop_id: String(t.shop_id),
          assigned_staff_id:
            t.assigned_staff_id != null ? String(t.assigned_staff_id) : null,
          verifier_staff_id:
            t.verifier_staff_id != null ? String(t.verifier_staff_id) : null,
        },
        taskActor,
      ),
    ).length;

    const payload = {
      clock_context: clockContext,
      today_status: todayStatus,
      pending_tasks: pendingTasks,
      unread_notifications: unread,
      operations_center: {
        total_unread: opsSummary.total_unread,
        total_items: opsSummary.total_items,
        recent: opsSummary.recent.map((r) => ({
          id: r.id,
          title: r.title,
          content_type: r.content_type,
          is_pending: r.is_pending,
        })),
      },
    };
    endDevTimer("employee_dashboard");
    return NextResponse.json(payload);
  } catch (e) {
    endDevTimer("employee_dashboard");
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
