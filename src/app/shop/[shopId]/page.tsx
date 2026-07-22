import { redirect } from "next/navigation";
import { CLOCK_ROUTE } from "@/lib/clock-routes";
import { normalizeShopId } from "@/lib/shop-id";

export const dynamic = "force-dynamic";

/** /shop/{id} → /shop/{id}/clock (preserves ?t= QR token) */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { shopId: raw } = await params;
  const shopId = normalizeShopId(raw);
  const sp = await searchParams;
  const token = typeof sp.t === "string" && sp.t.trim() ? sp.t.trim() : "";
  const qs = token ? `?t=${encodeURIComponent(token)}` : "";
  redirect(`${CLOCK_ROUTE.canonical(shopId)}${qs}`);
}
