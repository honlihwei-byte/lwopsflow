import type { CompanyRecord, CompanyStatus } from "@/lib/company";
import { companyRowFromDb } from "@/lib/company";
import { trialEndsAtFromStart } from "@/lib/company";
import {
  normalizePlanSlug,
  planBySlug,
  PLAN_LIMIT_MESSAGE,
  FREE_PLAN,
  type PaymentStatus,
  type PlanSlug,
} from "@/lib/subscription-plans";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const SUBSCRIPTION_SELECT_BASE =
  "company_id, status, plan_slug, payment_status, trial_started_at, trial_ends_at, subscription_ends_at, next_billing_at, current_period_end, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_subscription_status, cancel_at_period_end, user_id, max_staff, max_shops";

const SUBSCRIPTION_SELECT_ADDONS = "extra_shops, extra_staff_packs";

const SUBSCRIPTION_SELECT_FULL = `${SUBSCRIPTION_SELECT_BASE}, ${SUBSCRIPTION_SELECT_ADDONS}`;

function isMissingSubscriptionAddonColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /extra_shops|extra_staff_packs/i.test(message) ||
    message.includes("42703") ||
    /column.*does not exist/i.test(message)
  );
}

export type SubscriptionRow = {
  company_id: string;
  status: CompanyStatus;
  plan_slug: string;
  payment_status: PaymentStatus;
  trial_started_at: string;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  next_billing_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_status: string | null;
  cancel_at_period_end: boolean;
  user_id: string | null;
  max_staff: number | null;
  max_shops: number | null;
  extra_shops: number;
  extra_staff_packs: number;
};

export type PlanLimits = {
  max_shops: number | null;
  max_staff: number | null;
  staff_used: number;
  shop_used: number;
};

export type CompanyFeatureAccess = "full" | "billing_only" | "blocked";

export function subscriptionRowFromDb(row: Record<string, unknown>): SubscriptionRow {
  return {
    company_id: String(row.company_id),
    status: row.status as CompanyStatus,
    plan_slug: String(row.plan_slug ?? "trial"),
    payment_status: (row.payment_status as PaymentStatus) ?? "pending",
    trial_started_at: String(row.trial_started_at ?? new Date().toISOString()),
    trial_ends_at: row.trial_ends_at != null ? String(row.trial_ends_at) : null,
    subscription_ends_at:
      row.subscription_ends_at != null ? String(row.subscription_ends_at) : null,
    next_billing_at: row.next_billing_at != null ? String(row.next_billing_at) : null,
    current_period_end: row.current_period_end != null ? String(row.current_period_end) : null,
    stripe_customer_id: row.stripe_customer_id != null ? String(row.stripe_customer_id) : null,
    stripe_subscription_id:
      row.stripe_subscription_id != null ? String(row.stripe_subscription_id) : null,
    stripe_price_id: row.stripe_price_id != null ? String(row.stripe_price_id) : null,
    stripe_subscription_status:
      row.stripe_subscription_status != null ? String(row.stripe_subscription_status) : null,
    cancel_at_period_end: row.cancel_at_period_end === true,
    user_id: row.user_id != null ? String(row.user_id) : null,
    max_staff: row.max_staff != null ? Number(row.max_staff) : null,
    max_shops: row.max_shops != null ? Number(row.max_shops) : null,
    extra_shops: Number(row.extra_shops ?? 0) || 0,
    extra_staff_packs: Number(row.extra_staff_packs ?? 0) || 0,
  };
}

export async function fetchSubscription(
  supabase: Supabase,
  companyId: string,
): Promise<SubscriptionRow | null> {
  const primary = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT_FULL)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!primary.error && primary.data) {
    return subscriptionRowFromDb(primary.data as Record<string, unknown>);
  }

  if (primary.error && isMissingSubscriptionAddonColumnError(primary.error.message)) {
    const fallback = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_SELECT_BASE)
      .eq("company_id", companyId)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return subscriptionRowFromDb({
      ...(fallback.data as Record<string, unknown>),
      extra_shops: 0,
      extra_staff_packs: 0,
    });
  }

  return null;
}

/** Derive subscription from company when subscriptions row missing. */
export function subscriptionFromCompany(company: CompanyRecord): SubscriptionRow {
  return {
    company_id: company.id,
    status: company.status,
    plan_slug: company.status === "trial" ? "trial" : "starter",
    payment_status: company.status === "active" ? "paid" : "pending",
    trial_started_at: company.trial_started_at,
    trial_ends_at: company.trial_ends_at,
    subscription_ends_at: company.subscription_ends_at,
    next_billing_at: null,
    current_period_end: null,
    stripe_customer_id: company.stripe_customer_id ?? null,
    stripe_subscription_id: company.stripe_subscription_id ?? null,
    stripe_price_id: null,
    stripe_subscription_status: null,
    cancel_at_period_end: false,
    user_id: company.auth_user_id ?? null,
    max_staff: null,
    max_shops: null,
    extra_shops: 0,
    extra_staff_packs: 0,
  };
}

export async function getSubscriptionForCompany(
  supabase: Supabase,
  company: CompanyRecord,
): Promise<SubscriptionRow> {
  const sub = await fetchSubscription(supabase, company.id);
  return sub ?? subscriptionFromCompany(company);
}

export function resolveEffectiveStatus(
  company: CompanyRecord,
  sub: SubscriptionRow,
  options?: { emailVerified?: boolean },
): CompanyStatus {
  if (company.status === "pending_email_verification") {
    const verified =
      options?.emailVerified === true ||
      Boolean(company.email_verified_at);
    if (!verified) {
      return "pending_email_verification";
    }
    // Auth/DB says verified but status row not synced yet — show trial until repair runs.
  }
  if (company.active === false || sub.status === "suspended" || company.status === "suspended") {
    return "suspended";
  }
  const now = Date.now();
  const hasPaidStripeSubscription =
    Boolean(sub.stripe_subscription_id ?? company.stripe_subscription_id) &&
    sub.status === "active" &&
    sub.payment_status === "paid";
  if (hasPaidStripeSubscription) {
    const end = sub.subscription_ends_at ?? company.subscription_ends_at;
    if (end && new Date(end).getTime() < now) return "expired";
    return "active";
  }
  if (sub.status === "active" || company.status === "active") {
    const end = sub.subscription_ends_at ?? company.subscription_ends_at;
    if (end && new Date(end).getTime() < now) return "expired";
    const trialEnd = sub.trial_ends_at ?? company.trial_ends_at;
    if (trialEnd && new Date(trialEnd).getTime() < now && !end) return "expired";
    return "active";
  }
  if (sub.status === "trial" || company.status === "trial") {
    const end = sub.trial_ends_at ?? company.trial_ends_at;
    if (end && new Date(end).getTime() < now) return "expired";
    return "trial";
  }
  if (sub.status === "expired" || company.status === "expired") return "expired";
  return sub.status ?? company.status;
}

/** Login: blocked when suspended, inactive, or email not verified. */
export function companyCanLogin(company: CompanyRecord, sub: SubscriptionRow): boolean {
  if (company.active === false) return false;
  if (company.status === "pending_email_verification") return false;
  const effective = resolveEffectiveStatus(company, sub);
  return effective !== "suspended";
}

/** Admin features vs billing-only pages. */
export function companyFeatureAccess(
  company: CompanyRecord,
  sub: SubscriptionRow,
): CompanyFeatureAccess {
  if (!companyCanLogin(company, sub)) return "blocked";
  const effective = resolveEffectiveStatus(company, sub);
  if (effective === "active") return "full";
  if (effective === "trial") return "full";
  return "billing_only";
}

export function clockSubscriptionMessage(): string {
  return "Subscription expired. Please contact your employer.";
}

export function subscriptionExpiredAdminMessage(isTrial: boolean): string {
  if (isTrial) {
    return "Your trial has ended. Your data is safe. Upgrade to continue using OpsFlow.";
  }
  return "Your subscription has expired. Your data is safe. Upgrade to continue using OpsFlow.";
}

/** Effective caps from plan catalog + add-ons. Trial uses Starter limits. Catalog is source of truth for paid plans. */
export function effectivePlanLimits(sub: SubscriptionRow): { maxShops: number | null; maxStaff: number | null } {
  const slug = normalizePlanSlug(sub.plan_slug);
  if (slug === "free") {
    return { maxShops: FREE_PLAN.maxShops, maxStaff: FREE_PLAN.maxStaff };
  }
  const plan = slug === "trial" ? planBySlug("starter") : planBySlug(sub.plan_slug);
  const baseShops = plan ? plan.maxShops : (sub.max_shops ?? null);
  const baseStaff = plan ? plan.maxStaff : (sub.max_staff ?? null);

  return {
    maxShops: baseShops != null ? baseShops + (sub.extra_shops ?? 0) : null,
    maxStaff: baseStaff != null ? baseStaff + (sub.extra_staff_packs ?? 0) * 10 : null,
  };
}

export async function getPlanLimitsForCompany(
  supabase: Supabase,
  companyId: string,
  sub: SubscriptionRow,
): Promise<PlanLimits> {
  const [staff_used, shop_used] = await Promise.all([
    staffCountForCompany(supabase, companyId),
    shopCountForCompany(supabase, companyId),
  ]);
  const caps = effectivePlanLimits(sub);
  return {
    max_staff: caps.maxStaff,
    max_shops: caps.maxShops,
    staff_used,
    shop_used,
  };
}

export async function canAddShop(
  supabase: Supabase,
  companyId: string,
  company: CompanyRecord,
  sub: SubscriptionRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const effective = resolveEffectiveStatus(company, sub);
  if (effective !== "active" && effective !== "trial") {
    return { ok: false, message: subscriptionExpiredAdminMessage(effective === "expired") };
  }
  const { maxShops } = effectivePlanLimits(sub);
  if (maxShops == null) return { ok: true };
  const count = await shopCountForCompany(supabase, companyId);
  if (count >= maxShops) return { ok: false, message: PLAN_LIMIT_MESSAGE };
  return { ok: true };
}

export async function canAddStaff(
  supabase: Supabase,
  companyId: string,
  company: CompanyRecord,
  sub: SubscriptionRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const effective = resolveEffectiveStatus(company, sub);
  if (effective !== "active" && effective !== "trial") {
    return { ok: false, message: subscriptionExpiredAdminMessage(effective === "expired") };
  }
  const { maxStaff } = effectivePlanLimits(sub);
  if (maxStaff == null) return { ok: true };
  const count = await staffCountForCompany(supabase, companyId);
  if (count >= maxStaff) return { ok: false, message: PLAN_LIMIT_MESSAGE };
  return { ok: true };
}

export async function attendanceCountForCompany(
  supabase: Supabase,
  companyId: string,
): Promise<number> {
  const { data: shops } = await supabase.from("shops").select("id").eq("company_id", companyId);
  const shopIds = (shops ?? []).map((s) => s.id as string);
  if (shopIds.length === 0) return 0;
  const { count } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .in("shop_id", shopIds);
  return count ?? 0;
}

export async function companyClockAllowed(
  supabase: Supabase,
  companyId: string,
): Promise<boolean> {
  const { data: companyRow } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  if (!companyRow) return true;
  const company = companyRowFromDb(companyRow as Record<string, unknown>);
  const sub = await getSubscriptionForCompany(supabase, company);
  const effective = resolveEffectiveStatus(company, sub);
  return effective === "active" || effective === "trial";
}

export async function syncCompanyFromSubscription(
  supabase: Supabase,
  companyId: string,
  sub: Partial<SubscriptionRow> & { status: CompanyStatus },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: sub.status,
    updated_at: new Date().toISOString(),
  };
  if (sub.trial_started_at) patch.trial_started_at = sub.trial_started_at;
  if (sub.trial_ends_at !== undefined) patch.trial_ends_at = sub.trial_ends_at;
  if (sub.subscription_ends_at !== undefined) patch.subscription_ends_at = sub.subscription_ends_at;

  const { error: companyErr } = await supabase.from("companies").update(patch).eq("id", companyId);
  if (companyErr) {
    throw new Error(`Failed to update company subscription status: ${companyErr.message}`);
  }

  const trialStartedAt = sub.trial_started_at ?? new Date().toISOString();
  const subRow: Record<string, unknown> = {
    company_id: companyId,
    status: sub.status,
    plan_slug: sub.plan_slug ?? "starter",
    payment_status: sub.payment_status ?? "pending",
    trial_started_at: trialStartedAt,
    trial_ends_at: sub.trial_ends_at,
    subscription_ends_at: sub.subscription_ends_at,
    updated_at: new Date().toISOString(),
  };
  if (sub.max_staff !== undefined) subRow.max_staff = sub.max_staff;
  if (sub.max_shops !== undefined) subRow.max_shops = sub.max_shops;
  if (sub.extra_shops !== undefined) subRow.extra_shops = sub.extra_shops;
  if (sub.extra_staff_packs !== undefined) subRow.extra_staff_packs = sub.extra_staff_packs;

  let { error: subErr } = await supabase
    .from("subscriptions")
    .upsert(subRow, { onConflict: "company_id" });

  if (subErr && isMissingSubscriptionAddonColumnError(subErr.message)) {
    delete subRow.extra_shops;
    delete subRow.extra_staff_packs;
    ({ error: subErr } = await supabase
      .from("subscriptions")
      .upsert(subRow, { onConflict: "company_id" }));
  }

  if (subErr) {
    throw new Error(`Failed to upsert subscription row: ${subErr.message}`);
  }
}

export function addDays(iso: string | null, days: number): string {
  const d = iso ? new Date(iso) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function staffCountForCompany(supabase: Supabase, companyId: string): Promise<number> {
  const { count } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active");
  return count ?? 0;
}

export async function shopCountForCompany(supabase: Supabase, companyId: string): Promise<number> {
  const { count } = await supabase
    .from("shops")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  return count ?? 0;
}

export function nextInvoiceNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${y}${m}-${r}`;
}

export function nextPaymentReference(): string {
  return `PAY-${Date.now().toString(36).toUpperCase()}`;
}

export async function createPendingPlanPayment(
  supabase: Supabase,
  company: CompanyRecord,
  planSlug: PlanSlug,
): Promise<{ paymentId: string; invoiceId: string; reference: string }> {
  const plan = planBySlug(planSlug);
  if (!plan || plan.amountCents == null) {
    throw new Error("Invalid plan for self-service checkout.");
  }

  const reference = nextPaymentReference();
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 7);

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      company_id: company.id,
      plan_slug: planSlug,
      amount_cents: plan.amountCents,
      currency: "MYR",
      status: "pending",
      reference_code: reference,
      due_at: dueAt.toISOString(),
      notes: `${plan.name} monthly subscription`,
    })
    .select("id")
    .single();

  if (payErr || !payment) throw new Error(payErr?.message ?? "Payment create failed");

  const invNum = nextInvoiceNumber();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      company_id: company.id,
      payment_id: payment.id,
      invoice_number: invNum,
      plan_slug: planSlug,
      amount_cents: plan.amountCents,
      status: "issued",
      period_start: new Date().toISOString(),
      period_end: addDays(new Date().toISOString(), 30),
    })
    .select("id")
    .single();

  if (invErr || !invoice) throw new Error(invErr?.message ?? "Invoice create failed");

  await supabase
    .from("subscriptions")
    .upsert(
      {
        company_id: company.id,
        plan_slug: planSlug,
        payment_status: "pending",
        max_staff: plan.maxStaff,
        max_shops: plan.maxShops,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );

  return {
    paymentId: String(payment.id),
    invoiceId: String(invoice.id),
    reference,
  };
}

export async function markPaymentPaidAndActivate(
  supabase: Supabase,
  companyId: string,
  paymentId?: string,
): Promise<void> {
  const now = new Date();
  const subEnd = new Date(now);
  subEnd.setDate(subEnd.getDate() + 30);

  if (paymentId) {
    await supabase
      .from("payments")
      .update({ status: "paid", paid_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", paymentId)
      .eq("company_id", companyId);

    const { data: pay } = await supabase
      .from("payments")
      .select("id, plan_slug")
      .eq("id", paymentId)
      .maybeSingle();

    if (pay) {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: now.toISOString() })
        .eq("payment_id", paymentId);

      const plan = planBySlug(String(pay.plan_slug));
      await syncCompanyFromSubscription(supabase, companyId, {
        status: "active",
        plan_slug: String(pay.plan_slug),
        payment_status: "paid",
        subscription_ends_at: subEnd.toISOString(),
        max_staff: plan?.maxStaff ?? null,
        max_shops: plan?.maxShops ?? null,
      });
      await supabase.from("companies").update({ active: true }).eq("id", companyId);
      return;
    }
  }

  const sub = await fetchSubscription(supabase, companyId);
  const plan = planBySlug(sub?.plan_slug ?? "starter");
  await syncCompanyFromSubscription(supabase, companyId, {
    status: "active",
    plan_slug: sub?.plan_slug ?? "starter",
    payment_status: "paid",
    subscription_ends_at: subEnd.toISOString(),
    trial_ends_at: sub?.trial_ends_at ?? null,
    trial_started_at: sub?.trial_started_at ?? now.toISOString(),
    max_staff: plan?.maxStaff ?? sub?.max_staff ?? null,
    max_shops: plan?.maxShops ?? sub?.max_shops ?? null,
  });
  await supabase.from("companies").update({ active: true }).eq("id", companyId);
}

export async function ensureTrialSubscription(
  supabase: Supabase,
  companyId: string,
): Promise<void> {
  const started = new Date();
  const trialEnd = trialEndsAtFromStart(started);
  await syncCompanyFromSubscription(supabase, companyId, {
    status: "trial",
    plan_slug: "trial",
    payment_status: "pending",
    trial_started_at: started.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
    subscription_ends_at: null,
  });
}
