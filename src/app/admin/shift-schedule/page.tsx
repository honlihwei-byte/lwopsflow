import { Suspense } from "react";
import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const ShopManager = dynamic(() => import("../shops/ShopManager").then((m) => ({ default: m.ShopManager })), {
  loading: () => <I18nLoadingText />,
});

export default function ShiftSchedulePage() {
  return (
    <Suspense fallback={<I18nLoadingText />}>
      <ShopManager variant="schedule" />
    </Suspense>
  );
}
