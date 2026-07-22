import { Suspense } from "react";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";
import { AdminAttendancePage } from "./AdminAttendancePage";

export default function AttendancePage() {
  return (
    <Suspense
      fallback={
        <I18nLoadingText messageKey="loading.attendance" className="px-4 py-12 text-center text-sm text-zinc-500" />
      }
    >
      <AdminAttendancePage />
    </Suspense>
  );
}
