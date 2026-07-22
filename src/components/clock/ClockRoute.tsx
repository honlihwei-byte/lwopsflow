import { Suspense } from "react";
import { InvalidQrFallback } from "@/components/InvalidQrFallback";
import { isValidShopId, normalizeShopId } from "@/lib/shop-id";
import { ClockPageClient } from "@/app/shop/[shopId]/clock/ClockPageClient";
import { ClockScreenSkeleton } from "@/app/shop/[shopId]/clock/ClockScreenSkeleton";

export const dynamic = "force-dynamic";

type Props = {
  shopIdRaw: string;
};

/** Shared server entry for /shop/[shopId]/clock and /clock/[shopId]. */
export function ClockRoute({ shopIdRaw }: Props) {
  const shopId = normalizeShopId(shopIdRaw);

  if (!isValidShopId(shopId)) {
    return (
      <InvalidQrFallback detail="The shop id in this QR link is not valid. Please scan an updated QR from your manager." />
    );
  }

  return (
    <Suspense fallback={<ClockScreenSkeleton />}>
      <ClockPageClient shopId={shopId} />
    </Suspense>
  );
}
