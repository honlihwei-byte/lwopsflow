import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  createOperationsContent,
  listOperationsContent,
  listShopsForCompany,
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

function parseDates(body: Record<string, unknown>): {
  publish_date: string | null;
  effective_date: string | null;
  end_date: string | null | undefined;
} {
  const publish_date = ymd(body.publish_date);
  const effective_date = ymd(body.effective_date) ?? publish_date;
  const end_date =
    "end_date" in body
      ? ymd(body.end_date)
      : "expiry_date" in body
        ? ymd(body.expiry_date)
        : undefined;
  return { publish_date, effective_date, end_date };
}

function parseShopIds(body: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(body.shop_ids)
    ? body.shop_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return [...new Set(fromArray)];
  return [];
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shop_id = url.searchParams.get("shop_id")?.trim() || undefined;
    const content_type = url.searchParams.get("content_type")?.trim() as OperationsContentType | undefined;
    const status = url.searchParams.get("status")?.trim() as OperationsStatus | undefined;
    const include_shops = url.searchParams.get("include_shops") === "true";

    if (shop_id) {
      const deny = await assertShopScope(supabase, shop_id, scope.companyId);
      if (deny) return deny;
    }

    const [items, shops] = await Promise.all([
      listOperationsContent(supabase, scope.companyId, { shop_id, content_type, status }),
      include_shops ? listShopsForCompany(supabase, scope.companyId) : Promise.resolve(null),
    ]);

    return NextResponse.json({ items, shops });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    const content_type = String(body.content_type ?? "").trim() as OperationsContentType;
    const { publish_date, effective_date, end_date } = parseDates(body);
    const target_all_shops = body.target_all_shops === true;
    const shop_ids = parseShopIds(body);
    const status = (String(body.status ?? "draft").trim() || "draft") as OperationsStatus;

    if (!title || !publish_date || !effective_date) {
      return NextResponse.json(
        { error: "title, publish_date, and effective_date are required" },
        { status: 400 },
      );
    }
    if (!OPERATIONS_CONTENT_TYPES.includes(content_type)) {
      return NextResponse.json({ error: "Invalid content_type" }, { status: 400 });
    }
    if (!OPERATIONS_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (!target_all_shops && shop_ids.length === 0) {
      return NextResponse.json({ error: "Select at least one shop or enable all shops" }, { status: 400 });
    }

    for (const shopId of shop_ids) {
      const deny = await assertShopScope(supabase, shopId, scope.companyId);
      if (deny) return deny;
    }

    const row = await createOperationsContent(supabase, scope.companyId, {
      title,
      description: String(body.description ?? ""),
      content_type,
      target_all_shops,
      shop_ids,
      require_acknowledgement: body.require_acknowledgement === true,
      require_task_completion: body.require_task_completion === true,
      require_photo_proof: body.require_photo_proof === true,
      publish_date,
      effective_date,
      end_date: end_date ?? null,
      status,
      created_by: scope.session.companyName ?? "admin",
    });

    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
