import { Suspense } from "react";
import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const OperationsCenterManager = dynamic(
  () =>
    import("@/components/admin/operations-center/OperationsCenterManager").then((m) => ({
      default: m.OperationsCenterManager,
    })),
  { loading: () => <I18nLoadingText messageKey="loading.generic" /> },
);

export default function OperationsCenterAdminPage() {
  return (
    <Suspense fallback={<I18nLoadingText messageKey="loading.generic" />}>
      <OperationsCenterManager />
    </Suspense>
  );
}
