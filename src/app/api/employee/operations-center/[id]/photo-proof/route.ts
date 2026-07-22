import { NextResponse } from "next/server";
import { isNextResponse, requireEmployeeSession } from "@/lib/employee-api-auth";
import { resolveEmployeeClockContext } from "@/lib/employee-clock-context";
import {
  getEmployeeOperationsDetail,
  uploadOperationsPhotoProof,
} from "@/lib/operations-center/db";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteCtx = { params: Promise<{ id: string }> };

function deviceInfo(req: Request): string {
  return req.headers.get("user-agent")?.slice(0, 500) ?? "";
}

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const actor = await requireEmployeeSession(req, supabase);
    if (isNextResponse(actor)) return actor;

    const clockContext = await resolveEmployeeClockContext(supabase, {
      staff_id: actor.staffId,
      company_id: actor.companyId,
    });
    const shopId =
      clockContext.selected_shop_id ||
      clockContext.assigned_shops[0]?.id ||
      clockContext.accessible_shops[0]?.id ||
      null;
    if (!shopId) {
      return NextResponse.json({ error: "No shop assigned." }, { status: 403 });
    }

    const item = await getEmployeeOperationsDetail(supabase, {
      companyId: actor.companyId,
      staffId: actor.staffId,
      contentId: id,
      shopId,
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const result = await uploadOperationsPhotoProof(supabase, {
      companyId: actor.companyId,
      contentId: id,
      staffId: actor.staffId,
      shopId,
      file,
      mimeType: file.type || "image/jpeg",
      deviceInfo: deviceInfo(req),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
