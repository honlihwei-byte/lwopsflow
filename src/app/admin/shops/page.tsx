import { Suspense } from "react";
import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const ShopManager = dynamic(() => import("./ShopManager").then((m) => ({ default: m.ShopManager })), {
  loading: () => <I18nLoadingText messageKey="loading.shops" />,
});

export default function ShopsAdminPage() {
  return (
    <Suspense fallback={<I18nLoadingText messageKey="loading.shops" />}>
      <ShopManager />
    </Suspense>
  );
}
