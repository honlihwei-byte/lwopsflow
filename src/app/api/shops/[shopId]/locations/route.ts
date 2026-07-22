import { NextResponse } from "next/server";
import {
  listShopGpsLocations,
  nextSortOrder,
  SHOP_GPS_LOCATION_SELECT,
  shopGpsLocationFromBody,
} from "@/lib/shop-gps-locations";
import { GPS_LOCATIONS_TABLE_MISSING_MSG } from "@/lib/api-error";
import { GpsLocationsTableMissingError } from "@/lib/shop-gps-locations";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .maybeSingle();
    if (shopErr || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    const locations = await listShopGpsLocations(supabase, shopId, false);
    return NextResponse.json({ locations });
  } catch (e) {
    console.error("[shop-gps-locations] GET failed", e);
    if (e instanceof GpsLocationsTableMissingError) {
      return NextResponse.json(
        { locations: [], tableMissing: true, error: GPS_LOCATIONS_TABLE_MISSING_MSG },
        { status: 200 },
      );
    }
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const body = await req.json();
    const parsed = shopGpsLocationFromBody(body as Record<string, unknown>);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .maybeSingle();
    if (shopErr || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const sort_order =
      parsed.value.sort_order ?? (await nextSortOrder(supabase, shopId));

    const { data, error } = await supabase
      .from("shop_gps_locations")
      .insert({
        shop_id: shopId,
        name: parsed.value.name,
        latitude: parsed.value.latitude,
        longitude: parsed.value.longitude,
        allowed_radius_meters: parsed.value.allowed_radius_meters,
        location_type: parsed.value.location_type,
        is_active: parsed.value.is_active,
        sort_order,
      })
      .select(SHOP_GPS_LOCATION_SELECT)
      .single();

    if (error) {
      console.error("[shop-gps-locations] POST insert failed", error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    return NextResponse.json({ location: data });
  } catch (e) {
    console.error("[shop-gps-locations] POST failed", e);
    if (e instanceof GpsLocationsTableMissingError) {
      return NextResponse.json(
        { error: GPS_LOCATIONS_TABLE_MISSING_MSG, tableMissing: true },
        { status: 503 },
      );
    }
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
