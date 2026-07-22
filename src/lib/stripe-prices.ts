import { normalizePlanSlug, type PlanSlug } from "@/lib/subscription-plans";

const PRICE_ENV: Record<Exclude<PlanSlug, "trial" | "free">, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  business: "STRIPE_PRICE_BUSINESS",
};

export function stripePriceIdForPlan(slug: PlanSlug): string | null {
  const normalized = normalizePlanSlug(slug);
  if (normalized === "trial" || normalized === "free") return null;
  const envKey = PRICE_ENV[normalized];
  const value = process.env[envKey]?.trim();
  return value || null;
}

export function planSlugFromStripePriceId(priceId: string): PlanSlug | null {
  const id = priceId.trim();
  for (const [slug, envKey] of Object.entries(PRICE_ENV) as [Exclude<PlanSlug, "trial" | "free">, string][]) {
    if (process.env[envKey]?.trim() === id) {
      return slug;
    }
  }
  return null;
}

/** Infer plan from Stripe Price amount (MYR payment links). */
export function planSlugFromPriceAmount(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
): PlanSlug | null {
  if (amountCents == null || !currency) return null;
  if (currency.toLowerCase() !== "myr") return null;
  if (amountCents === 2900) return "starter";
  if (amountCents === 5900) return "growth";
  if (amountCents === 9900) return "business";
  return null;
}

/** Infer plan from Stripe product name. */
export function planSlugFromProductName(name: string | null | undefined): PlanSlug | null {
  const n = name?.trim().toLowerCase() ?? "";
  if (!n) return null;
  if (n.includes("starter")) return "starter";
  if (n.includes("growth")) return "growth";
  if (n.includes("business") || n.includes("pro")) return "business";
  return null;
}

export function planSlugFromStripePrice(
  price: { id?: string; unit_amount?: number | null; currency?: string; product?: unknown } | null | undefined,
): PlanSlug | null {
  if (!price) return null;
  if (price.id) {
    const fromId = planSlugFromStripePriceId(price.id);
    if (fromId) return fromId;
  }
  const fromAmount = planSlugFromPriceAmount(price.unit_amount, price.currency);
  if (fromAmount) return fromAmount;
  const product = price.product;
  if (product && typeof product === "object" && "name" in product) {
    return planSlugFromProductName(String((product as { name?: string }).name ?? ""));
  }
  return null;
}

export function stripePricesConfigured(): boolean {
  return (
    Boolean(stripePriceIdForPlan("starter")) &&
    Boolean(stripePriceIdForPlan("growth")) &&
    Boolean(stripePriceIdForPlan("business"))
  );
}
