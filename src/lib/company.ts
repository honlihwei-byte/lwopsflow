/** Company tenant + subscription helpers (no attendance math). */

export type CompanyStatus =
  | "trial"
  | "active"
  | "suspended"
  | "expired"
  | "pending_email_verification";

export type CompanyRecord = {
  id: string;
  name: string;
  code: string;
  login_id?: string | null;
  status: CompanyStatus;
  trial_started_at: string;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  admin_pin?: string;
  owner_name?: string | null;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
  password_hash?: string | null;
  auth_user_id?: string | null;
  email_verified_at?: string | null;
  timezone?: string | null;
  billing_contact_email?: string | null;
  billing_contact_phone?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SubscriptionAccess = "allowed" | "subscription_required" | "suspended";

export const TRIAL_DAYS = 14;

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  pending_email_verification: "Pending verification",
};

export function normalizeCompanyCode(code: string): string {
  return code.trim().toUpperCase();
}

export function trialEndsAtFromStart(startedAt: Date): Date {
  const end = new Date(startedAt);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return end;
}

/** Whether clock / punch APIs may run for this company (legacy; prefer billing.ts). */
export function companySubscriptionAccess(company: CompanyRecord): SubscriptionAccess {
  if (company.status === "suspended") return "suspended";
  if (company.status === "expired") return "subscription_required";

  const now = Date.now();

  if (company.status === "trial") {
    const endMs = company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : 0;
    if (endMs > now) return "allowed";
    return "subscription_required";
  }

  if (company.status === "active") {
    if (company.subscription_ends_at) {
      const subEnd = new Date(company.subscription_ends_at).getTime();
      if (subEnd < now) return "subscription_required";
    }
    return "allowed";
  }

  return "subscription_required";
}

export function subscriptionBlockMessage(access: SubscriptionAccess): string {
  if (access === "suspended") {
    return "This company account is suspended. Contact support.";
  }
  return "Subscription expired. Please contact your employer.";
}

export function companyRowFromDb(row: Record<string, unknown>): CompanyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    login_id: row.login_id != null ? String(row.login_id) : null,
    status: row.status as CompanyStatus,
    trial_started_at: String(row.trial_started_at ?? new Date().toISOString()),
    trial_ends_at: row.trial_ends_at != null ? String(row.trial_ends_at) : null,
    subscription_ends_at:
      row.subscription_ends_at != null ? String(row.subscription_ends_at) : null,
    admin_pin: row.admin_pin != null ? String(row.admin_pin) : undefined,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    phone: row.phone != null ? String(row.phone) : null,
    email: row.email != null ? String(row.email) : null,
    active: row.active !== false,
    password_hash: row.password_hash != null ? String(row.password_hash) : null,
    auth_user_id: row.auth_user_id != null ? String(row.auth_user_id) : null,
    email_verified_at:
      row.email_verified_at != null ? String(row.email_verified_at) : null,
    timezone: row.timezone != null ? String(row.timezone) : "Asia/Kuala_Lumpur",
    billing_contact_email:
      row.billing_contact_email != null ? String(row.billing_contact_email) : null,
    billing_contact_phone:
      row.billing_contact_phone != null ? String(row.billing_contact_phone) : null,
    stripe_customer_id:
      row.stripe_customer_id != null ? String(row.stripe_customer_id) : null,
    stripe_subscription_id:
      row.stripe_subscription_id != null ? String(row.stripe_subscription_id) : null,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}
