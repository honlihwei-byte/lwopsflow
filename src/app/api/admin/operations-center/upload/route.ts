import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { getOperationsContentDetail, uploadOperationsAttachment } from "@/lib/operations-center/db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const form = await req.formData();
    const contentId = String(form.get("content_id") ?? "").trim();
    const file = form.get("file");

    if (!contentId || !(file instanceof File)) {
      return NextResponse.json({ error: "content_id and file are required" }, { status: 400 });
    }

    const content = await getOperationsContentDetail(supabase, scope.companyId, contentId);
    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    for (const shopId of content.shop_ids) {
      if (!content.target_all_shops) {
        const deny = await assertShopScope(supabase, shopId, scope.companyId);
        if (deny) return deny;
      }
    }

    const result = await uploadOperationsAttachment(supabase, {
      companyId: scope.companyId,
      contentId,
      file,
      fileName: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
