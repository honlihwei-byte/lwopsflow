import { NextResponse } from "next/server";
import { listActiveStaffForShop } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

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

    const staff = await listActiveStaffForShop(supabase, shopId);
    return NextResponse.json({ staff });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
