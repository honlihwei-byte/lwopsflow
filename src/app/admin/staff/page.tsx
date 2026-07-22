import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const StaffManager = dynamic(() => import("./StaffManager").then((m) => ({ default: m.StaffManager })), {
  loading: () => <I18nLoadingText messageKey="loading.staff" />,
});

export default function StaffAdminPage() {
  return <StaffManager />;
}
