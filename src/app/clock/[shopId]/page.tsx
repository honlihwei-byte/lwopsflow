import { ClockRoute } from "@/components/clock/ClockRoute";

export const dynamic = "force-dynamic";

/** Legacy QR path: /clock/{shopId} — same clock UI as /shop/{shopId}/clock */
export default async function ClockLegacyPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return <ClockRoute shopIdRaw={shopId} />;
}
