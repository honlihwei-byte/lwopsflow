import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const ShopManager = dynamic(() => import("../shops/ShopManager").then((m) => ({ default: m.ShopManager })), {
  loading: () => <I18nLoadingText />,
});

export default function ShiftSchedulePage() {
  return <ShopManager variant="schedule" />;
}
