import { NextResponse } from "next/server";
import { generatePunchQrToken } from "@/lib/punch-qr-token";
import { buildClockPageUrl } from "@/lib/clock-routes";
import { SHOP_GPS_SELECT } from "@/lib/shop-gps";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught, bodyFromPostgrest } from "@/lib/supabase/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const token = generatePunchQrToken();
    const { data, error } = await supabase
      .from("shops")
      .update({ punch_qr_token: token })
      .eq("id", shopId)
      .select(SHOP_GPS_SELECT)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json(bodyFromPostgrest(error), { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const clockUrl = buildClockPageUrl(shopId, token);

    return NextResponse.json({
      ok: true,
      shop: data,
      punch_qr_token: token,
      clock_url: clockUrl,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
