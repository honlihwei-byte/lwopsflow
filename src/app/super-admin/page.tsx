import { SuperAdminCompaniesTable } from "@/components/super-admin/SuperAdminCompaniesTable";
import { StripeWebhookAlerts } from "@/components/super-admin/StripeWebhookAlerts";

export default function SuperAdminPage() {
  return (
    <div className="mx-auto max-w-[100vw] space-y-6 px-4 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Platform
        </p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Super Admin</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Company subscriptions and billing — no access to attendance, staff PII, GPS, or reports.
        </p>
      </header>
      <StripeWebhookAlerts />
      <SuperAdminCompaniesTable />
    </div>
  );
}
