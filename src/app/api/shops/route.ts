import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import {
  canAddShop,
  getSubscriptionForCompany,
} from "@/lib/billing";
import { fetchCompanyById } from "@/lib/company-db";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { requireOpsFeatureAccess } from "@/lib/ops-api-auth";
import { generatePunchQrToken } from "@/lib/punch-qr-token";
import { shopGpsFromBody } from "@/lib/shop-gps";
import {
  SHOP_FULL_SELECT,
  shopSchedulingFromBody,
} from "@/lib/shop-scheduling";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireOpsFeatureAccess(req, supabase, {
      permissions: [
        "shop.view_assigned",
        "shop.view_all",
        "shop.manage_assigned",
        "shop.manage_all",
      ],
    });
    if (isNextResponse(scope)) return scope;

    let query = supabase
      .from("shops")
      .select(SHOP_FULL_SELECT)
      .eq("company_id", scope.companyId)
      .order("name");

    if (scope.kind === "employee" && scope.companyShopIds.length > 0) {
      query = query.in("id", scope.companyShopIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }
    return NextResponse.json({ shops: data ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const company = await fetchCompanyById(supabase, scope.companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const sub = await getSubscriptionForCompany(supabase, company);
    const shopLimit = await canAddShop(supabase, scope.companyId, company, sub);
    if (!shopLimit.ok) {
      return NextResponse.json({ error: shopLimit.message, code: "PLAN_LIMIT" }, { status: 403 });
    }

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
      .insert({
        name,
        company_id: scope.companyId,
        latitude: gpsParsed.value.latitude,
        longitude: gpsParsed.value.longitude,
        allowed_radius_meters: gpsParsed.value.allowed_radius_meters,
        gps_indoor_mode: gpsParsed.value.gps_indoor_mode,
        allow_photo_proof_fallback: gpsParsed.value.allow_photo_proof_fallback,
        work_time_mode: scheduling.work_time_mode,
        opening_time: scheduling.opening_time,
        closing_time: scheduling.closing_time,
        break_minutes: scheduling.break_minutes,
        punch_qr_token: generatePunchQrToken(),
      })
      .select(SHOP_FULL_SELECT)
      .single();
    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    if (data.latitude != null && data.longitude != null) {
      try {
        await supabase.from("shop_gps_locations").insert({
          shop_id: data.id,
          name: "Main Entrance",
          latitude: data.latitude,
          longitude: data.longitude,
          allowed_radius_meters: data.allowed_radius_meters ?? 50,
          location_type: "main",
          is_active: true,
          sort_order: 0,
        });
      } catch {
        /* table may not exist yet */
      }
    }

    return NextResponse.json({ shop: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
