import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Hard-delete a shop and all shop-scoped data so it no longer counts toward plan limits.
 * Caller must verify company scope before calling.
 */
export async function permanentlyDeleteShop(
  supabase: Supabase,
  shopId: string,
  companyId: string,
): Promise<void> {
  const { data: shop, error: shopLoadErr } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (shopLoadErr) throw shopLoadErr;
  if (!shop) {
    throw new Error("Shop not found in your company.");
  }

  const { error: attErr } = await supabase.from("attendance").delete().eq("shop_id", shopId);
  if (attErr) throw attErr;

  const { error: forgotErr } = await supabase
    .from("forgot_punch_requests")
    .delete()
    .eq("shop_id", shopId);
  if (forgotErr) throw forgotErr;

  const { error: schedErr } = await supabase.from("staff_schedules").delete().eq("shop_id", shopId);
  if (schedErr) throw schedErr;

  const { error: tplErr } = await supabase
    .from("shop_shift_templates")
    .delete()
    .eq("shop_id", shopId);
  if (tplErr) throw tplErr;

  const { error: assignErr } = await supabase
    .from("staff_shop_assignments")
    .delete()
    .eq("shop_id", shopId);
  if (assignErr) throw assignErr;

  const { error: gpsErr } = await supabase.from("shop_gps_locations").delete().eq("shop_id", shopId);
  if (gpsErr) throw gpsErr;

  const { error: notifErr } = await supabase.from("notifications").delete().eq("shop_id", shopId);
  if (notifErr && !/does not exist|42P01/i.test(notifErr.message ?? "")) {
    throw notifErr;
  }

  const { error: delErr } = await supabase
    .from("shops")
    .delete()
    .eq("id", shopId)
    .eq("company_id", companyId);

  if (delErr) throw delErr;
}
