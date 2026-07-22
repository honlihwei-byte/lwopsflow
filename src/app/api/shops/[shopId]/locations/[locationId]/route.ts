import { NextResponse } from "next/server";
import { SHOP_GPS_LOCATION_SELECT, shopGpsLocationFromBody } from "@/lib/shop-gps-locations";
import { GPS_LOCATIONS_TABLE_MISSING_MSG } from "@/lib/api-error";
import { GpsLocationsTableMissingError } from "@/lib/shop-gps-locations";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shopId: string; locationId: string }> },
) {
  const { shopId, locationId } = await ctx.params;
  try {
    const body = await req.json();
    const parsed = shopGpsLocationFromBody(body as Record<string, unknown>);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createAdminClient();
    const updates: Record<string, unknown> = {
      name: parsed.value.name,
      latitude: parsed.value.latitude,
      longitude: parsed.value.longitude,
      allowed_radius_meters: parsed.value.allowed_radius_meters,
      location_type: parsed.value.location_type,
      is_active: parsed.value.is_active,
      updated_at: new Date().toISOString(),
    };
    if (parsed.value.sort_order != null) {
      updates.sort_order = parsed.value.sort_order;
    }

    const { data, error } = await supabase
      .from("shop_gps_locations")
      .update(updates)
      .eq("id", locationId)
      .eq("shop_id", shopId)
      .select(SHOP_GPS_LOCATION_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[shop-gps-locations] PATCH failed", error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    return NextResponse.json({ location: data });
  } catch (e) {
    console.error("[shop-gps-locations] PATCH error", e);
    if (e instanceof GpsLocationsTableMissingError) {
      return NextResponse.json(
        { error: GPS_LOCATIONS_TABLE_MISSING_MSG, tableMissing: true },
        { status: 503 },
      );
    }
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ shopId: string; locationId: string }> },
) {
  const { shopId, locationId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("shop_gps_locations")
      .delete()
      .eq("id", locationId)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[shop-gps-locations] DELETE failed", error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[shop-gps-locations] DELETE error", e);
    if (e instanceof GpsLocationsTableMissingError) {
      return NextResponse.json(
        { error: GPS_LOCATIONS_TABLE_MISSING_MSG, tableMissing: true },
        { status: 503 },
      );
    }
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
