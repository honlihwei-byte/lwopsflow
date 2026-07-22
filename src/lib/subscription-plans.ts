/** SaaS plan catalog — limits by shops/staff only; all features included on every plan. */

export type PlanSlug = "trial" | "free" | "starter" | "growth" | "business";

/** Legacy slugs stored before plan rename (migration 035). */
export type LegacyPlanSlug = "multi_shop" | "enterprise";

export type PaymentStatus = "pending" | "paid" | "overdue";

/** Limits applied when a paid subscription is cancelled (Free Plan). */
export const FREE_PLAN = {
  slug: "free" as const,
  name: "Free",
  maxShops: 1,
  maxStaff: 5,
};

export const ALL_PLAN_FEATURES = [
  "QR attendance",
  "GPS verification",
  "Indoor / high-rise mode",
  "Multiple GPS points",
  "Photo proof fallback",
  "Forgot punch request",
  "Fixed working time",
  "Shift scheduling",
  "Attendance reports",
  "Late / absent / overtime tracking",
  "Multi-shop dashboard",
  "Performance tracking",
] as const;

export const ADDON_EXTRA_SHOP_PRICE = "RM5/month";
export const ADDON_EXTRA_STAFF_PRICE = "RM5/month per 10 staff";

export type PlanDefinition = {
  slug: PlanSlug;
  name: string;
  priceLabel: string;
  amountCents: number;
  /** null = unlimited (Business plan). */
  maxShops: number | null;
  /** null = unlimited (Business plan). */
  maxStaff: number | null;
  description: string;
};

export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    slug: "starter",
    name: "Starter",
    priceLabel: "RM29/month",
    amountCents: 2900,
    maxShops: 3,
    maxStaff: 30,
    description: "3 shops · 30 staff · Full features included",
  },
  {
    slug: "growth",
    name: "Growth",
    priceLabel: "RM59/month",
    amountCents: 5900,
    maxShops: 10,
    maxStaff: 100,
    description: "10 shops · 100 staff · Full features included",
  },
  {
    slug: "business",
    name: "Business",
    priceLabel: "RM99/month",
    amountCents: 9900,
    maxShops: null,
    maxStaff: null,
    description: "Unlimited shops · Unlimited staff · Full features included",
  },
];

export function planShopsLimitLabel(maxShops: number | null): string {
  return maxShops == null ? "Unlimited shops" : `${maxShops} shops`;
}

export function planStaffLimitLabel(maxStaff: number | null): string {
  return maxStaff == null ? "Unlimited staff" : `${maxStaff} staff`;
}

export function planLimitsShortLabel(plan: Pick<PlanDefinition, "maxShops" | "maxStaff">): string {
  return `${planShopsLimitLabel(plan.maxShops)} · ${planStaffLimitLabel(plan.maxStaff)}`;
}

export function normalizePlanSlug(slug: string): PlanSlug | "trial" {
  const s = slug.trim().toLowerCase();
  if (s === "trial") return "trial";
  if (s === "free") return "free";
  if (s === "multi_shop") return "business";
  if (s === "enterprise") return "business";
  if (s === "starter" || s === "growth" || s === "business") return s;
  return "starter";
}

export function planBySlug(slug: string): PlanDefinition | undefined {
  const normalized = normalizePlanSlug(slug);
  if (normalized === "trial" || normalized === "free") return undefined;
  return SUBSCRIPTION_PLANS.find((p) => p.slug === normalized);
}

export function planDisplayName(slug: string): string {
  if (slug === "trial") return "Trial";
  if (slug === "free") return FREE_PLAN.name;
  const normalized = normalizePlanSlug(slug);
  if (normalized === "trial") return "Trial";
  if (normalized === "free") return FREE_PLAN.name;
  return planBySlug(slug)?.name ?? slug;
}

export const PLAN_LIMIT_MESSAGE =
  "You have reached your plan limit. Upgrade plan or add extra capacity.";
