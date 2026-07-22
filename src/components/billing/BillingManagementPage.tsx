"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { btnPrimary, btnSecondary } from "@/components/marketing/MarketingShell";
import {
  displayPaymentStatus,
  displaySubscriptionStatus,
} from "@/lib/i18n/display-values";
import { formatTemplate } from "@/lib/i18n/format-template";
import { CancelSubscriptionModal } from "@/components/billing/CancelSubscriptionModal";
import { SubscribeNowButton } from "@/components/billing/SubscribeNowButton";
import { PageGuide } from "@/components/help/PageGuide";
import {
  ADDON_EXTRA_SHOP_PRICE,
  ADDON_EXTRA_STAFF_PRICE,
  ALL_PLAN_FEATURES,
  type PlanDefinition,
} from "@/lib/subscription-plans";

type BillingData = {
  company: { name: string; company_id: string };
  subscription: {
    plan_name: string;
    plan_slug: string;
    status: string;
    subscription_status: string;
    payment_status: string;
    trial_ends_at: string | null;
    subscription_ends_at: string | null;
    current_period_end: string | null;
    next_billing_at: string | null;
    renewal_date: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    staff_count: number;
    shop_count: number;
    staff_limit: number | null;
    shop_limit: number | null;
    extra_shops: number;
    extra_staff_packs: number;
  };
  can_manage_stripe: boolean;
  can_cancel_subscription: boolean;
  summary: { attendance_records: number };
  plans: PlanDefinition[];
  all_features: string[];
  payments: Array<{
    id: string;
    plan_slug: string;
    amount_cents: number;
    status: string;
    reference_code: string | null;
    created_at: string;
    paid_at: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    plan_slug: string;
    amount_cents: number;
    status: string;
    issued_at: string;
    paid_at: string | null;
  }>;
};

function formatRm(cents: number) {
  return `RM${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function usageExceedsLimit(used: number, limit: number | null): boolean {
  return limit != null && used > limit;
}

export function BillingManagementPage() {
  const { t } = useI18n();
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const plansRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/company/billing", { credentials: "include" });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error || t("billing.failedLoad"));
      return;
    }
    setData(j);
    setError(null);
  }, [t]);

  function limitLabel(used: number, limit: number | null): string {
    if (limit == null) {
      return formatTemplate(t("billing.limitUsedUnlimited"), { used });
    }
    return formatTemplate(t("billing.limitUsedOf"), { used, limit });
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function openCustomerPortal() {
    setBusy("portal");
    setNotice(null);
    try {
      const res = await fetch("/api/company/billing/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ return_path: "/admin/billing" }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || t("billing.portalError"));
        return;
      }
      if (j.portal_url) window.open(j.portal_url, "_blank");
    } finally {
      setBusy(null);
    }
  }

  async function syncFromStripe() {
    setBusy("sync");
    setNotice(null);
    try {
      const res = await fetch("/api/company/billing/sync-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || t("billing.syncError"));
        return;
      }
      setNotice(t("billing.syncSuccess"));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function confirmCancelSubscription() {
    setBusy("cancel");
    try {
      const res = await fetch("/api/company/billing/cancel-subscription", {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || t("billing.cancelError"));
        return;
      }
      setNotice(t("billing.cancelSuccess"));
      setShowCancelModal(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function scrollToPlans() {
    plansRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  if (error) {
    return <p className="py-20 text-center text-sm text-red-600">{error}</p>;
  }

  if (!data) {
    return <p className="py-20 text-center text-sm text-zinc-500">{t("billing.loading")}</p>;
  }

  const { subscription: sub } = data;
  const shopOverLimit = usageExceedsLimit(sub.shop_count, sub.shop_limit);
  const staffOverLimit = usageExceedsLimit(sub.staff_count, sub.staff_limit);
  const usageOverLimit = shopOverLimit || staffOverLimit;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <PageGuide pageId="subscription" />
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {data.company.name} · {data.company.company_id}
        </p>
      </header>

      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("billing.subscriptionManagement")}
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">{t("billing.currentPlan")}</dt>
            <dd className="font-semibold">{sub.plan_name}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.subscriptionStatus")}</dt>
            <dd className="font-semibold">
              {displaySubscriptionStatus(t, sub.subscription_status)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.paymentStatus")}</dt>
            <dd className="font-semibold capitalize">
              {displayPaymentStatus(t, sub.payment_status)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.nextBillingDate")}</dt>
            <dd>{formatDate(sub.next_billing_at ?? sub.current_period_end)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.renewalDate")}</dt>
            <dd>{formatDate(sub.renewal_date ?? sub.subscription_ends_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.shops")}</dt>
            <dd className={shopOverLimit ? "font-semibold text-amber-700 dark:text-amber-400" : undefined}>
              {limitLabel(sub.shop_count, sub.shop_limit)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("billing.staff")}</dt>
            <dd className={staffOverLimit ? "font-semibold text-amber-700 dark:text-amber-400" : undefined}>
              {limitLabel(sub.staff_count, sub.staff_limit)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">{t("billing.stripeCustomerId")}</dt>
            <dd className="font-mono text-xs break-all">{sub.stripe_customer_id ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">{t("billing.stripeSubscriptionId")}</dt>
            <dd className="font-mono text-xs break-all">{sub.stripe_subscription_id ?? "—"}</dd>
          </div>
        </dl>

        {usageOverLimit ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {t("billing.usageOverLimit")}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={scrollToPlans} className={btnPrimary("text-sm")}>
            {t("billing.upgradePlan")}
          </button>
          {data.can_manage_stripe ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openCustomerPortal()}
              className={btnSecondary("text-sm disabled:opacity-50")}
            >
              {busy === "portal" ? t("billing.opening") : t("billing.manageBilling")}
            </button>
          ) : null}
          {sub.plan_slug === "trial" && !sub.stripe_subscription_id ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void syncFromStripe()}
              className={btnSecondary("text-sm disabled:opacity-50")}
            >
              {busy === "sync" ? t("billing.syncing") : t("billing.syncFromStripe")}
            </button>
          ) : null}
          {data.can_cancel_subscription ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setShowCancelModal(true)}
              className={btnSecondary("text-sm text-red-700 dark:text-red-400 disabled:opacity-50")}
            >
              {t("billing.cancelSubscription")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t("billing.dataSummary")}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {formatTemplate(t("billing.dataSummaryLine"), {
            shops: sub.shop_count,
            staff: sub.staff_count,
            records: data.summary.attendance_records.toLocaleString(),
          })}
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t("billing.allPlansFeatures")}</h2>
        <ul className="mt-3 grid gap-1 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
          {(data.all_features ?? ALL_PLAN_FEATURES).map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-emerald-600">✓</span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      <section ref={plansRef}>
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t("billing.availablePlans")}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {formatTemplate(t("billing.addonsHint"), {
            shopPrice: ADDON_EXTRA_SHOP_PRICE,
            staffPrice: ADDON_EXTRA_STAFF_PRICE,
          })}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {data.plans.map((plan) => (
            <div
              key={plan.slug}
              className={`flex flex-col rounded-2xl border p-5 shadow-sm ${
                sub.plan_slug === plan.slug
                  ? "border-[#2563EB] ring-2 ring-[#2563EB]/20"
                  : "border-zinc-200 dark:border-zinc-800"
              } bg-white dark:bg-zinc-950`}
            >
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50">{plan.name}</h3>
              <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">
                {plan.priceLabel}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{plan.description}</p>
              <SubscribeNowButton planSlug={plan.slug} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t("billing.paymentHistory")}</h2>
        {data.payments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">{t("billing.noPayments")}</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {data.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
              >
                <span className="font-mono text-xs">{p.reference_code ?? p.id.slice(0, 8)}</span>
                <span>{formatRm(p.amount_cents)}</span>
                <span className="capitalize">{p.status}</span>
                <span className="text-zinc-500">{formatDate(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t("billing.invoices")}</h2>
        {data.invoices.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">{t("billing.noInvoices")}</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {data.invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
              >
                <span className="font-mono text-xs">{inv.invoice_number}</span>
                <span>{formatRm(inv.amount_cents)}</span>
                <span className="capitalize">{inv.status}</span>
                <span className="text-zinc-500">{formatDate(inv.issued_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CancelSubscriptionModal
        open={showCancelModal}
        periodEnd={sub.current_period_end ?? sub.next_billing_at}
        busy={busy === "cancel"}
        onConfirm={() => void confirmCancelSubscription()}
        onClose={() => setShowCancelModal(false)}
      />
    </div>
  );
}
