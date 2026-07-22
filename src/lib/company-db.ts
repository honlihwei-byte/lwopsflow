import type { CompanyRecord } from "@/lib/company";
import { companyRowFromDb, normalizeCompanyCode } from "@/lib/company";
import { normalizeCompanyLoginId } from "@/lib/company-auth";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const COMPANY_SELECT =
  "id, name, code, login_id, status, trial_started_at, trial_ends_at, subscription_ends_at, admin_pin, owner_name, phone, email, active, password_hash, auth_user_id, email_verified_at, timezone, billing_contact_email, billing_contact_phone, stripe_customer_id, stripe_subscription_id, created_at, updated_at";

export async function fetchCompanyByLoginId(
  supabase: Supabase,
  loginId: string,
): Promise<CompanyRecord | null> {
  return fetchCompanyByCompanyIdInput(supabase, loginId);
}

/**
 * Resolve company from login form "Company ID".
 * Matches companies.login_id (company_id_code) or companies.code (company_code).
 */
export async function fetchCompanyByCompanyIdInput(
  supabase: Supabase,
  companyIdInput: string,
): Promise<CompanyRecord | null> {
  const raw = companyIdInput.trim();
  if (!raw) return null;

  const asLoginId = normalizeCompanyLoginId(raw);
  const asCode = normalizeCompanyCode(raw);

  const candidates = [...new Set([asLoginId, asCode, raw.toUpperCase()].filter(Boolean))];

  for (const key of candidates) {
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_SELECT)
      .or(`login_id.ilike.${key},code.ilike.${key}`)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return companyRowFromDb(data as Record<string, unknown>);
    }
  }

  return null;
}

export async function fetchCompanyByAuthUserId(
  supabase: Supabase,
  authUserId: string,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return companyRowFromDb(data as Record<string, unknown>);
}

/** Resolve company for Supabase Auth email login (auth_user_id → company_users → email). */
export async function fetchCompanyForAuthLogin(
  supabase: Supabase,
  params: { authUserId: string; email: string },
): Promise<CompanyRecord | null> {
  let company = await fetchCompanyByAuthUserId(supabase, params.authUserId);
  if (company) return company;

  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", params.authUserId)
    .maybeSingle();

  if (cu?.company_id) {
    company = await fetchCompanyById(supabase, String(cu.company_id));
    if (company) return company;
  }

  return fetchCompanyByEmail(supabase, params.email);
}

export async function fetchCompanyByEmail(
  supabase: Supabase,
  email: string,
): Promise<CompanyRecord | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: byEmail, error: emailErr } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .ilike("email", normalized)
    .maybeSingle();
  if (!emailErr && byEmail) {
    return companyRowFromDb(byEmail as Record<string, unknown>);
  }

  const { data: byBilling, error: billingErr } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .ilike("billing_contact_email", normalized)
    .maybeSingle();
  if (!billingErr && byBilling) {
    return companyRowFromDb(byBilling as Record<string, unknown>);
  }

  return null;
}

export async function fetchCompanyById(
  supabase: Supabase,
  companyId: string,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return companyRowFromDb(data as Record<string, unknown>);
}

export async function fetchCompanyByCode(
  supabase: Supabase,
  code: string,
): Promise<CompanyRecord | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .ilike("code", code.trim())
    .maybeSingle();
  if (error || !data) return null;
  return companyRowFromDb(data as Record<string, unknown>);
}

export async function fetchCompanyForShop(
  supabase: Supabase,
  shopId: string,
): Promise<CompanyRecord | null> {
  const { data: shop, error } = await supabase
    .from("shops")
    .select("company_id")
    .eq("id", shopId)
    .maybeSingle();
  if (error || !shop?.company_id) return null;
  return fetchCompanyById(supabase, String(shop.company_id));
}

export async function shopIdsForCompany(
  supabase: Supabase,
  companyId: string,
): Promise<string[]> {
  const { data, error } = await supabase.from("shops").select("id").eq("company_id", companyId);
  if (error) return [];
  return (data ?? []).map((r) => String(r.id));
}

export async function assertShopInCompany(
  supabase: Supabase,
  shopId: string,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function listCompaniesForSuperAdmin(supabase: Supabase) {
  const { data: companies, error } = await supabase
    .from("companies")
    .select(
      "id, name, code, login_id, status, trial_started_at, trial_ends_at, subscription_ends_at, owner_name, phone, email, active, auth_user_id, email_verified_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("company_id, plan_slug, payment_status, subscription_ends_at, trial_ends_at");

  const subMap = new Map<string, Record<string, unknown>>();
  for (const s of subs ?? []) {
    subMap.set(String(s.company_id), s as Record<string, unknown>);
  }

  const { data: shopRows } = await supabase.from("shops").select("company_id");
  const shopCounts = new Map<string, number>();
  for (const row of shopRows ?? []) {
    const cid = String(row.company_id ?? "");
    if (cid) shopCounts.set(cid, (shopCounts.get(cid) ?? 0) + 1);
  }

  const { data: staffRows } = await supabase.from("staff").select("company_id");
  const staffCounts = new Map<string, number>();
  for (const row of staffRows ?? []) {
    const cid = String(row.company_id ?? "");
    if (cid) staffCounts.set(cid, (staffCounts.get(cid) ?? 0) + 1);
  }

  return (companies ?? []).map((c) => {
    const row = companyRowFromDb(c as Record<string, unknown>);
    const sub = subMap.get(row.id);
    const companyIdDisplay = row.login_id?.trim() || row.code;
    return {
      ...row,
      company_id_display: companyIdDisplay,
      shop_count: shopCounts.get(row.id) ?? 0,
      staff_count: staffCounts.get(row.id) ?? 0,
      plan_slug: sub ? String(sub.plan_slug ?? "trial") : row.status === "trial" ? "trial" : "starter",
      payment_status: sub ? String(sub.payment_status ?? "pending") : "pending",
      subscription_ends_at:
        sub?.subscription_ends_at != null
          ? String(sub.subscription_ends_at)
          : row.subscription_ends_at,
      trial_ends_at:
        sub?.trial_ends_at != null ? String(sub.trial_ends_at) : row.trial_ends_at,
    };
  });
}

export async function listCompaniesSummary(supabase: Supabase) {
  const { data: companies, error } = await supabase
    .from("companies")
    .select(
      "id, name, code, login_id, status, trial_started_at, trial_ends_at, subscription_ends_at, active, created_at",
    )
    .order("name");
  if (error) throw new Error(error.message);

  const { data: shopCounts } = await supabase.from("shops").select("company_id");
  const counts = new Map<string, number>();
  for (const row of shopCounts ?? []) {
    const cid = String(row.company_id ?? "");
    if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  return (companies ?? []).map((c) => {
    const row = companyRowFromDb(c as Record<string, unknown>);
    const companyIdDisplay = row.login_id?.trim() || row.code;
    return {
      ...row,
      company_id_display: companyIdDisplay,
      shop_count: counts.get(String(c.id)) ?? 0,
    };
  });
}
