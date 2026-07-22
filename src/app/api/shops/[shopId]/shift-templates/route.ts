import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  seedDefaultTemplatesForShop,
  listShopShiftTemplates,
  createShopShiftTemplate,
} from "@/lib/shifts/shop-shift-templates-db";
import { createAdminClient } from "@/lib/supabase/admin";

function hhmm(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(s)) throw new Error(`${field} must be HH:mm`);
  return s.slice(0, 5);
}

function breakMinutes(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(600, Math.round(n));
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const templates = await listShopShiftTemplates(supabase, {
      companyId: scope.companyId,
      shopId,
    });
    return NextResponse.json({ templates });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const body = (await req.json()) as Record<string, unknown>;

    if (body.seed_defaults === true) {
      const templates = await seedDefaultTemplatesForShop(supabase, shopId, scope.companyId);
      return NextResponse.json({ templates });
    }

    const template_scope = String(body.template_scope ?? "company").trim();
    const isShopOnly = template_scope === "shop";
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const template = await createShopShiftTemplate(supabase, {
      company_id: scope.companyId,
      shop_id: isShopOnly ? shopId : null,
      name,
      start_time: hhmm(body.start_time, "start_time"),
      end_time: hhmm(body.end_time, "end_time"),
      break_minutes: breakMinutes(body.break_minutes),
      sort_order: Number(body.sort_order ?? 0) || 0,
    });

    return NextResponse.json({ template });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
