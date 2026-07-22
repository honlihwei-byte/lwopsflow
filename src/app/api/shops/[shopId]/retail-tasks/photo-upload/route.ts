import { NextResponse } from "next/server";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import { getRetailTaskById } from "@/lib/retail-tasks/retail-tasks-db";
import { appendPhotoToTaskDraft } from "@/lib/retail-tasks/task-draft-db";
import { uploadTaskProofPhoto } from "@/lib/retail-tasks/task-photo-upload";
import { canSaveTaskDraft } from "@/lib/retail-tasks/task-permissions";
import { ensureStaffPermissionProfile } from "@/lib/permissions/staff-permissions-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const shopResult = await loadShopForPunch(supabase, shopId);
    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if (!shopResult.shop.companyId) {
      return NextResponse.json({ error: "Shop company not configured" }, { status: 400 });
    }

    const form = await req.formData();
    const staffId = String(form.get("staff_id") ?? "").trim();
    const taskId = String(form.get("task_id") ?? "").trim();
    const file = form.get("file");

    if (!staffId || !taskId || !(file instanceof Blob)) {
      return NextResponse.json({ error: "staff_id, task_id, and file are required" }, { status: 400 });
    }

    const staffResult = await validateStaffForPunch(supabase, shopId, { staffId });
    if ("error" in staffResult) {
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }

    const task = await getRetailTaskById(supabase, taskId);
    if (
      !task ||
      task.shop_id !== shopId ||
      task.company_id !== shopResult.shop.companyId
    ) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const profile = await ensureStaffPermissionProfile(supabase, {
      company_id: shopResult.shop.companyId,
      staff_id: staffId,
    });
    const actor = {
      kind: "staff" as const,
      staffId,
      name: staffResult.staff.staff_name,
      profile,
    };
    if (!canSaveTaskDraft(task, actor)) {
      return NextResponse.json(
        { error: "Start the task before uploading photos." },
        { status: 403 },
      );
    }

    const companyId = shopResult.shop.companyId;
    const [companyRes, shopRes, staffRes] = await Promise.all([
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
      supabase.from("shops").select("name").eq("id", shopId).maybeSingle(),
      supabase.from("staff").select("staff_name").eq("id", staffId).maybeSingle(),
    ]);

    const mimeType = file.type || "image/jpeg";
    const uploaded = await uploadTaskProofPhoto(supabase, {
      companyId,
      shopId,
      taskId,
      staffId,
      file,
      mimeType,
      companyName: String(companyRes.data?.name ?? "Company"),
      shopName: String(shopRes.data?.name ?? shopResult.shop.name ?? "Shop"),
      staffName: String(
        staffRes.data?.staff_name ??
          ("staff" in staffResult ? staffResult.staff.staff_name : "Staff"),
      ),
    });

    const draftAppend = await appendPhotoToTaskDraft(supabase, {
      task_id: taskId,
      staff_id: staffId,
      photo: {
        original_path: uploaded.original_path,
        display_path: uploaded.display_path,
        captured_at: uploaded.captured_at,
      },
    });
    if (draftAppend.skipped) {
      console.warn("[task-draft] photo draft append skipped — table unavailable", { taskId, staffId });
    }

    return NextResponse.json({
      ok: true,
      photo_url: uploaded.display_path,
      photo: {
        original_path: uploaded.original_path,
        display_path: uploaded.display_path,
        captured_at: uploaded.captured_at,
      },
      preview_url: uploaded.preview_url,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
