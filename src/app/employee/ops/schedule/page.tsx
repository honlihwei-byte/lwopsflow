import dynamic from "next/dynamic";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const ShopManager = dynamic(
  () => import("@/app/admin/shops/ShopManager").then((m) => ({ default: m.ShopManager })),
  { loading: () => <I18nLoadingText messageKey="loading.generic" /> },
);

export default function EmployeeOpsSchedulePage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="schedule">
        <ShopManager variant="schedule" />
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
