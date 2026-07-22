import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { listShopGpsLocations } from "@/lib/shop-gps-locations";
import { SHOP_FULL_SELECT, shopSchedulingFromBody } from "@/lib/shop-scheduling";
import { shopGpsFromBody } from "@/lib/shop-gps";
import { permanentlyDeleteShop } from "@/lib/shop-delete";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("shops")
      .select(SHOP_FULL_SELECT)
      .eq("id", shopId)
      .maybeSingle();
    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    let gps_locations: Awaited<ReturnType<typeof listShopGpsLocations>> = [];
    try {
      gps_locations = await listShopGpsLocations(supabase, shopId, true);
    } catch {
      /* legacy DB without migration */
    }

    return NextResponse.json({ shop: data, gps_locations });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function PATCH(
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

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const gpsParsed = shopGpsFromBody(body as Record<string, unknown>);
    if (!gpsParsed.ok) {
      return NextResponse.json({ error: gpsParsed.error }, { status: 400 });
    }
    const scheduling = shopSchedulingFromBody(body as Record<string, unknown>);
    const { data, error } = await supabase
      .from("shops")
      .update({
        name,
        latitude: gpsParsed.value.latitude,
        longitude: gpsParsed.value.longitude,
        allowed_radius_meters: gpsParsed.value.allowed_radius_meters,
        gps_indoor_mode: gpsParsed.value.gps_indoor_mode,
        allow_photo_proof_fallback: gpsParsed.value.allow_photo_proof_fallback,
        work_time_mode: scheduling.work_time_mode,
        opening_time: scheduling.opening_time,
        closing_time: scheduling.closing_time,
        break_minutes: scheduling.break_minutes,
      })
      .eq("id", shopId)
      .eq("company_id", scope.companyId)
      .select(SHOP_FULL_SELECT)
      .maybeSingle();
    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    return NextResponse.json({ shop: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function DELETE(
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

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }
    if (String(body.confirm ?? "").trim() !== "DELETE") {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" }.' },
        { status: 400 },
      );
    }

    await permanentlyDeleteShop(supabase, shopId, scope.companyId);
    return NextResponse.json({ ok: true, message: "Shop permanently deleted." });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
