import { Suspense } from "react";
import { EmployeeLoginForm } from "@/components/employee/EmployeeLoginForm";

export default function EmployeeLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <EmployeeLoginForm />
      </Suspense>
    </div>
  );
}
