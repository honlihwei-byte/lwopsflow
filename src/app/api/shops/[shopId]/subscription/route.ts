import { NextResponse } from "next/server";
import {
  clockSubscriptionMessage,
  companyClockAllowed,
  getSubscriptionForCompany,
} from "@/lib/billing";
import { COMPANY_STATUS_LABELS } from "@/lib/company";
import { fetchCompanyForShop } from "@/lib/company-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

/** Public: clock page checks tenant subscription (QR unchanged). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await ctx.params;
    const supabase = createAdminClient();

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, name, company_id")
      .eq("id", shopId)
      .maybeSingle();

    if (shopErr || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (!shop.company_id) {
      return NextResponse.json({
        allowed: true,
        legacy: true,
        shop_name: shop.name,
      });
    }

    const company = await fetchCompanyForShop(supabase, shopId);
    if (!company) {
      return NextResponse.json({ allowed: true, legacy: true, shop_name: shop.name });
    }

    const allowed = await companyClockAllowed(supabase, String(shop.company_id));
    const sub = await getSubscriptionForCompany(supabase, company);

    return NextResponse.json({
      allowed,
      access: allowed ? "allowed" : "subscription_required",
      message: allowed ? null : clockSubscriptionMessage(),
      company: {
        name: company.name,
        code: company.code,
        status: company.status,
        status_label: COMPANY_STATUS_LABELS[company.status],
        plan_slug: sub.plan_slug,
      },
      shop_name: shop.name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
