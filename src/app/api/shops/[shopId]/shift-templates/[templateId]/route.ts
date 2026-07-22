import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { deleteShopShiftTemplate, updateShopShiftTemplate } from "@/lib/shifts/shop-shift-templates-db";
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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shopId: string; templateId: string }> },
) {
  const { shopId, templateId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    const body = (await req.json()) as Record<string, unknown>;
    const template = await updateShopShiftTemplate(supabase, templateId, {
      name: body.name != null ? String(body.name).trim() : undefined,
      start_time: body.start_time != null ? hhmm(body.start_time, "start_time") : undefined,
      end_time: body.end_time != null ? hhmm(body.end_time, "end_time") : undefined,
      break_minutes: body.break_minutes != null ? breakMinutes(body.break_minutes) : undefined,
      sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
    });

    return NextResponse.json({ template });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ shopId: string; templateId: string }> },
) {
  const { shopId, templateId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    const deny = await assertShopScope(supabase, shopId, scope.companyId);
    if (deny) return deny;

    await deleteShopShiftTemplate(supabase, templateId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
