import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  deleteOperationsContent,
  getOperationsContentDetail,
  updateOperationsContent,
} from "@/lib/operations-center/db";
import {
  OPERATIONS_CONTENT_TYPES,
  OPERATIONS_STATUSES,
  type OperationsContentType,
  type OperationsStatus,
} from "@/lib/operations-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

function ymd(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseDatesPatch(body: Record<string, unknown>): {
  publish_date?: string;
  effective_date?: string;
  end_date?: string | null;
} {
  const out: { publish_date?: string; effective_date?: string; end_date?: string | null } = {};
  if (body.publish_date != null) {
    const publish = ymd(body.publish_date);
    if (publish) out.publish_date = publish;
  }
  if (body.effective_date != null) {
    const effective = ymd(body.effective_date);
    if (effective) out.effective_date = effective;
  }
  if ("end_date" in body || "expiry_date" in body) {
    out.end_date = "end_date" in body ? ymd(body.end_date) : ymd(body.expiry_date);
  }
  return out;
}

function parseShopIds(body: Record<string, unknown>): string[] | undefined {
  if (!("shop_ids" in body) && !("target_all_shops" in body)) return undefined;
  if (body.target_all_shops === true) return [];
  const fromArray = Array.isArray(body.shop_ids)
    ? body.shop_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  return [...new Set(fromArray)];
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const item = await getOperationsContentDetail(supabase, scope.companyId, id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const shop_ids = parseShopIds(body);
    if (shop_ids) {
      for (const shopId of shop_ids) {
        const deny = await assertShopScope(supabase, shopId, scope.companyId);
        if (deny) return deny;
      }
    }

    const content_type = body.content_type
      ? (String(body.content_type).trim() as OperationsContentType)
      : undefined;
    if (content_type && !OPERATIONS_CONTENT_TYPES.includes(content_type)) {
      return NextResponse.json({ error: "Invalid content_type" }, { status: 400 });
    }

    const status = body.status ? (String(body.status).trim() as OperationsStatus) : undefined;
    if (status && !OPERATIONS_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const dates = parseDatesPatch(body);

    const item = await updateOperationsContent(supabase, scope.companyId, id, {
      title: body.title != null ? String(body.title) : undefined,
      description: body.description != null ? String(body.description) : undefined,
      content_type,
      target_all_shops: typeof body.target_all_shops === "boolean" ? body.target_all_shops : undefined,
      shop_ids,
      require_acknowledgement:
        typeof body.require_acknowledgement === "boolean" ? body.require_acknowledgement : undefined,
      require_task_completion:
        typeof body.require_task_completion === "boolean" ? body.require_task_completion : undefined,
      require_photo_proof:
        typeof body.require_photo_proof === "boolean" ? body.require_photo_proof : undefined,
      ...dates,
      status,
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const existing = await getOperationsContentDetail(supabase, scope.companyId, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteOperationsContent(supabase, scope.companyId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
