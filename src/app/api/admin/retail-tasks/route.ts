import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertOpsShopScope, requireOpsFeatureAccess } from "@/lib/ops-api-auth";
import { createRetailTasksForShops } from "@/lib/retail-tasks/create-multi-shop-tasks";
import { listRetailTasks } from "@/lib/retail-tasks/retail-tasks-db";
import type { TaskNotificationSettings } from "@/lib/notifications/types";
import { tickTaskRecurrence } from "@/lib/retail-tasks/task-recurrence";
import { normalizeChecklistItems } from "@/lib/retail-tasks/task-checklist";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_REPEAT_TYPES,
  type TaskCategory,
  type TaskPriority,
  type TaskRepeatType,
} from "@/lib/retail-tasks/types";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { createAdminClient } from "@/lib/supabase/admin";

function ymd(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("due_date must be YYYY-MM-DD");
  return s;
}

function parseShopIds(body: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(body.shop_ids)
    ? body.shop_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return [...new Set(fromArray)];

  const single = String(body.shop_id ?? "").trim();
  return single ? [single] : [];
}

function parseShopAssignments(
  body: Record<string, unknown>,
): Record<string, { assigned_staff_id?: string | null; verifier_staff_id?: string | null }> | undefined {
  const raw = body.shop_assignments;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, { assigned_staff_id?: string | null; verifier_staff_id?: string | null }> = {};
  for (const [shopId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!shopId.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    out[shopId] = {
      assigned_staff_id: row.assigned_staff_id ? String(row.assigned_staff_id).trim() : null,
      verifier_staff_id: row.verifier_staff_id ? String(row.verifier_staff_id).trim() : null,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireOpsFeatureAccess(req, supabase, {
      permissions: ["tasks.view_shop", "tasks.view_own", "tasks.create", "tasks.assign"],
    });
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id")?.trim() || undefined;
    const staffId = url.searchParams.get("staff_id")?.trim() || undefined;
    const from = url.searchParams.get("from")?.trim() || undefined;
    const to = url.searchParams.get("to")?.trim() || undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;

    if (shopId) {
      const deny = await assertOpsShopScope(supabase, scope, shopId);
      if (deny) return deny;
    }

    startDevTimer("task_list");
    await tickTaskRecurrence(supabase, scope.companyId);

    const rows = await listRetailTasks(supabase, {
      companyId: scope.companyId,
      shopId,
      staffId,
      from,
      to,
      status,
    });

    endDevTimer("task_list");
    return NextResponse.json({ tasks: rows });
  } catch (e) {
    endDevTimer("task_list");
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireOpsFeatureAccess(req, supabase, {
      permissions: ["tasks.create", "tasks.assign"],
    });
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const shop_ids = parseShopIds(body);
    const title = String(body.title ?? "").trim();
    const due_date = ymd(body.due_date);
    const category = String(body.category ?? "").trim() as TaskCategory;

    if (shop_ids.length === 0 || !title || !due_date) {
      return NextResponse.json(
        { error: "shop_ids (or shop_id), title, due_date are required" },
        { status: 400 },
      );
    }
    if (!TASK_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const priority = String(body.priority ?? "normal") as TaskPriority;
    const repeat_type = String(body.repeat_type ?? "one_time") as TaskRepeatType;
    if (!TASK_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    if (!TASK_REPEAT_TYPES.includes(repeat_type)) {
      return NextResponse.json({ error: "Invalid repeat_type" }, { status: 400 });
    }

    const { data: shopRows, error: shopsErr } = await supabase
      .from("shops")
      .select("id, name, company_id")
      .in("id", shop_ids)
      .eq("company_id", scope.companyId);
    if (shopsErr) throw new Error(shopsErr.message);

    const foundIds = new Set((shopRows ?? []).map((s) => String(s.id)));
    const missing = shop_ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json({ error: "One or more shops not found" }, { status: 404 });
    }

    for (const shop_id of shop_ids) {
      const shopDeny = await assertOpsShopScope(supabase, scope, shop_id);
      if (shopDeny) return shopDeny;
    }

    const shopNames = new Map<string, string>(
      (shopRows ?? []).map((s) => [String(s.id), String(s.name ?? "").trim() || "Shop"]),
    );

    const assigned_staff_id = body.assigned_staff_id
      ? String(body.assigned_staff_id).trim()
      : null;
    const verifier_staff_id = body.verifier_staff_id
      ? String(body.verifier_staff_id).trim()
      : null;
    const due_time = body.due_time ? String(body.due_time).slice(0, 5) : null;

    const min_photos = Math.max(0, Number(body.min_photos ?? (body.photo_required === true ? 1 : 0)) || 0);
    const photo_capture_mode =
      String(body.photo_capture_mode ?? "camera_only") === "camera_or_gallery"
        ? "camera_or_gallery"
        : "camera_only";
    const checklist_items = normalizeChecklistItems(body.checklist_items);

    const createdBy =
      scope.kind === "admin"
        ? (scope.admin.session.companyCode ?? scope.admin.session.companyName ?? "admin")
        : scope.actor.staffName;
    const actorMeta =
      scope.kind === "admin"
        ? { name: scope.admin.session.companyName ?? "Admin", role: "company_admin" as const }
        : {
            name: scope.actor.staffName,
            role: scope.actor.permissionProfile.role_template,
          };

    const reminderRaw = String(body.reminder_minutes ?? "").trim();
    const notification: TaskNotificationSettings = {
      notify_assigned_staff: body.notify_assigned_staff !== false,
      notify_supervisor: body.notify_supervisor === true,
      notify_store_manager: body.notify_store_manager === true,
      reminder_offset_minutes:
        reminderRaw === "15" || reminderRaw === "30" || reminderRaw === "60"
          ? Number(reminderRaw)
          : null,
    };

    const shop_assignments = parseShopAssignments(body);
    const default_assignment =
      shop_ids.length === 1 && !shop_assignments
        ? { assigned_staff_id, verifier_staff_id }
        : undefined;

    const result = await createRetailTasksForShops(supabase, {
      shop_ids,
      shopNames,
      template: {
        company_id: scope.companyId,
        title,
        description: body.description ? String(body.description) : null,
        category,
        priority,
        status: "pending",
        due_date,
        due_time,
        repeat_type,
        photo_required: min_photos > 0,
        min_photos,
        photo_capture_mode,
        checklist_items,
        gps_required: body.gps_required === true,
        feedback_allowed: body.feedback_allowed !== false,
        created_by: createdBy,
      },
      shop_assignments,
      default_assignment,
      actor: actorMeta,
      notification,
    });

    if (result.total_instances_created === 0 && result.skipped_duplicates.length > 0) {
      return NextResponse.json(
        {
          error: "Task already exists for selected shop/date",
          code: "duplicate_task",
          skipped_duplicates: result.skipped_duplicates,
          created_by_shop: [],
          instances_created: 0,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      task: result.tasks[0] ?? null,
      tasks: result.tasks,
      shop_ids,
      created_by_shop: result.created_by_shop,
      skipped_duplicates: result.skipped_duplicates,
      instances_created: result.total_instances_created,
      series_id: result.tasks[0]?.series_id ?? null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
