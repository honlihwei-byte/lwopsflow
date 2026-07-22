import { ClockRoute } from "@/components/clock/ClockRoute";

export const dynamic = "force-dynamic";

export default async function ClockPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return <ClockRoute shopIdRaw={shopId} />;
}
