import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import {
  activationExpiresAt,
  generateAccountToken,
  hashAccountToken,
  resetExpiresAt,
} from "@/lib/employee-account-tokens";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type EmployeeAccountStatus = "pending_activation" | "active" | "disabled";

export type EmployeeAccountRow = {
  id: string;
  staff_id: string;
  company_id: string;
  login_email: string | null;
  login_phone: string | null;
  status: EmployeeAccountStatus;
  preferred_locale: "en" | "zh" | "ms";
  last_login_at: string | null;
  password_set_at: string | null;
  activation_sent_at: string | null;
  activation_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  /** True when employee has set their own password. */
  has_password: boolean;
};

const SELECT =
  "id, staff_id, company_id, login_email, login_phone, status, preferred_locale, last_login_at, password_set_at, activation_sent_at, activation_token_expires_at, created_at, updated_at, password_hash";

export type ActivationTokenResult = {
  raw_token: string;
  expires_at: string;
};

function mapRow(row: Record<string, unknown>): EmployeeAccountRow {
  const statusRaw = String(row.status);
  let status: EmployeeAccountStatus = "pending_activation";
  if (statusRaw === "active") status = "active";
  else if (statusRaw === "disabled") status = "disabled";
  else if (statusRaw === "pending_activation") status = "pending_activation";

  const locale = String(row.preferred_locale ?? "en");
  const preferred_locale =
    locale === "zh" || locale === "ms" ? locale : ("en" as const);

  return {
    id: String(row.id),
    staff_id: String(row.staff_id),
    company_id: String(row.company_id),
    login_email: row.login_email != null ? String(row.login_email) : null,
    login_phone: row.login_phone != null ? String(row.login_phone) : null,
    status,
    preferred_locale,
    last_login_at: row.last_login_at != null ? String(row.last_login_at) : null,
    password_set_at: row.password_set_at != null ? String(row.password_set_at) : null,
    activation_sent_at:
      row.activation_sent_at != null ? String(row.activation_sent_at) : null,
    activation_token_expires_at:
      row.activation_token_expires_at != null
        ? String(row.activation_token_expires_at)
        : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    has_password: row.password_hash != null && String(row.password_hash).length > 0,
  };
}

export function toPublicAccount(row: EmployeeAccountRow): EmployeeAccountRow {
  return row;
}

export async function getEmployeeAccountByStaffId(
  supabase: Supabase,
  staffId: string,
): Promise<EmployeeAccountRow | null> {
  const { data, error } = await supabase
    .from("employee_accounts")
    .select(SELECT)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getEmployeeAccountById(
  supabase: Supabase,
  accountId: string,
): Promise<EmployeeAccountRow | null> {
  const { data, error } = await supabase
    .from("employee_accounts")
    .select(SELECT)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function findEmployeeAccountsByLogin(
  supabase: Supabase,
  identifier: string,
): Promise<
  Array<
    EmployeeAccountRow & {
      staff_name: string;
      company_name: string;
    }
  >
> {
  const email = identifier.includes("@") ? identifier.trim().toLowerCase() : null;
  const phone = !email ? identifier.replace(/\D/g, "") : null;

  let query = supabase
    .from("employee_accounts")
    .select(`${SELECT}, staff!inner(staff_name), companies!inner(name)`)
    .eq("status", "active")
    .not("password_hash", "is", null);

  if (email) {
    query = query.ilike("login_email", email);
  } else if (phone) {
    query = query.eq("login_phone", phone);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const staff = row.staff as { staff_name?: string } | null;
    const company = row.companies as { name?: string } | null;
    return {
      ...mapRow(row as Record<string, unknown>),
      staff_name: String(staff?.staff_name ?? ""),
      company_name: String(company?.name ?? ""),
    };
  });
}

function normalizeEmail(email?: string | null): string | null {
  const v = email?.trim().toLowerCase();
  return v || null;
}

function normalizePhone(phone?: string | null): string | null {
  const v = phone?.replace(/\D/g, "");
  return v || null;
}

/** Admin creates login — employee sets password via activation link. */
export async function createPendingEmployeeAccount(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    login_email?: string | null;
    login_phone?: string | null;
    preferred_locale?: "en" | "zh" | "ms";
  },
): Promise<{ account: EmployeeAccountRow; activation: ActivationTokenResult }> {
  const email = normalizeEmail(params.login_email);
  const phone = normalizePhone(params.login_phone);
  if (!email && !phone) {
    throw new Error("Email or phone is required.");
  }

  const activation = await buildActivationPatch();

  const { data, error } = await supabase
    .from("employee_accounts")
    .insert({
      staff_id: params.staff_id,
      company_id: params.company_id,
      login_email: email,
      login_phone: phone,
      password_hash: null,
      status: "pending_activation",
      preferred_locale: params.preferred_locale ?? "en",
      activation_token_hash: activation.token_hash,
      activation_token_expires_at: activation.expires_at,
      activation_sent_at: new Date().toISOString(),
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return {
    account: mapRow(data as Record<string, unknown>),
    activation: { raw_token: activation.raw_token, expires_at: activation.expires_at },
  };
}

async function buildActivationPatch(): Promise<{
  raw_token: string;
  token_hash: string;
  expires_at: string;
}> {
  const raw_token = generateAccountToken();
  return {
    raw_token,
    token_hash: hashAccountToken(raw_token),
    expires_at: activationExpiresAt(),
  };
}

export async function issueActivationToken(
  supabase: Supabase,
  accountId: string,
): Promise<ActivationTokenResult> {
  const activation = await buildActivationPatch();
  const { error } = await supabase
    .from("employee_accounts")
    .update({
      activation_token_hash: activation.token_hash,
      activation_token_expires_at: activation.expires_at,
      activation_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
  return { raw_token: activation.raw_token, expires_at: activation.expires_at };
}

export async function adminResetEmployeePassword(
  supabase: Supabase,
  accountId: string,
): Promise<ActivationTokenResult> {
  const activation = await buildActivationPatch();
  const { error } = await supabase
    .from("employee_accounts")
    .update({
      password_hash: null,
      password_set_at: null,
      status: "pending_activation",
      activation_token_hash: activation.token_hash,
      activation_token_expires_at: activation.expires_at,
      activation_sent_at: new Date().toISOString(),
      reset_token_hash: null,
      reset_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
  return { raw_token: activation.raw_token, expires_at: activation.expires_at };
}

export async function setEmployeeAccountStatus(
  supabase: Supabase,
  accountId: string,
  status: EmployeeAccountStatus,
): Promise<void> {
  const { error } = await supabase
    .from("employee_accounts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

export async function enableEmployeeLogin(
  supabase: Supabase,
  accountId: string,
): Promise<{ account: EmployeeAccountRow; activation?: ActivationTokenResult }> {
  const account = await getEmployeeAccountById(supabase, accountId);
  if (!account) throw new Error("Account not found");

  if (account.has_password) {
    await setEmployeeAccountStatus(supabase, accountId, "active");
    const updated = await getEmployeeAccountById(supabase, accountId);
    if (!updated) throw new Error("Account not found");
    return { account: updated };
  }

  const activation = await issueActivationToken(supabase, accountId);
  await setEmployeeAccountStatus(supabase, accountId, "pending_activation");
  const updated = await getEmployeeAccountById(supabase, accountId);
  if (!updated) throw new Error("Account not found");
  return { account: updated, activation };
}

export async function disableEmployeeLogin(
  supabase: Supabase,
  accountId: string,
): Promise<void> {
  await setEmployeeAccountStatus(supabase, accountId, "disabled");
}

export type ActivationPreview = {
  valid: boolean;
  staff_name?: string;
  company_name?: string;
  login_email?: string | null;
  login_phone?: string | null;
  expired?: boolean;
};

export async function previewActivationToken(
  supabase: Supabase,
  rawToken: string,
): Promise<ActivationPreview> {
  const token_hash = hashAccountToken(rawToken);
  const { data, error } = await supabase
    .from("employee_accounts")
    .select(`${SELECT}, staff!inner(staff_name), companies!inner(name)`)
    .eq("activation_token_hash", token_hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { valid: false };

  const expires = data.activation_token_expires_at
    ? new Date(String(data.activation_token_expires_at)).getTime()
    : 0;
  if (!expires || Date.now() > expires) {
    return { valid: false, expired: true };
  }

  const staff = data.staff as { staff_name?: string } | null;
  const company = data.companies as { name?: string } | null;
  const row = mapRow(data as Record<string, unknown>);

  return {
    valid: true,
    staff_name: String(staff?.staff_name ?? ""),
    company_name: String(company?.name ?? ""),
    login_email: row.login_email,
    login_phone: row.login_phone,
  };
}

export async function activateEmployeeAccount(
  supabase: Supabase,
  rawToken: string,
  password: string,
): Promise<EmployeeAccountRow> {
  const pwdErr = validatePasswordStrength(password);
  if (pwdErr) throw new Error(pwdErr);

  const token_hash = hashAccountToken(rawToken);
  const { data, error } = await supabase
    .from("employee_accounts")
    .select(SELECT)
    .eq("activation_token_hash", token_hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid or expired activation link.");

  const expires = data.activation_token_expires_at
    ? new Date(String(data.activation_token_expires_at)).getTime()
    : 0;
  if (!expires || Date.now() > expires) {
    throw new Error("Activation link has expired. Ask your manager to resend activation.");
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("employee_accounts")
    .update({
      password_hash: hashPassword(password),
      password_set_at: now,
      status: "active",
      activation_token_hash: null,
      activation_token_expires_at: null,
      updated_at: now,
    })
    .eq("id", data.id);
  if (updErr) throw new Error(updErr.message);

  const account = await getEmployeeAccountById(supabase, String(data.id));
  if (!account) throw new Error("Account not found after activation.");
  return account;
}

export async function verifyEmployeeLogin(
  supabase: Supabase,
  accountId: string,
  password: string,
): Promise<EmployeeAccountRow | null> {
  const { data, error } = await supabase
    .from("employee_accounts")
    .select(SELECT)
    .eq("id", accountId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const hash = data.password_hash != null ? String(data.password_hash) : "";
  if (!hash || !verifyPassword(password, hash)) return null;

  await supabase
    .from("employee_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", accountId);

  return mapRow(data as Record<string, unknown>);
}

export async function updateEmployeeAccountContact(
  supabase: Supabase,
  accountId: string,
  params: {
    login_email?: string | null;
    login_phone?: string | null;
    preferred_locale?: "en" | "zh" | "ms";
  },
): Promise<EmployeeAccountRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (params.login_email !== undefined) {
    patch.login_email = normalizeEmail(params.login_email);
  }
  if (params.login_phone !== undefined) {
    patch.login_phone = normalizePhone(params.login_phone);
  }
  if (params.preferred_locale !== undefined) {
    patch.preferred_locale = params.preferred_locale;
  }

  if (params.login_email !== undefined || params.login_phone !== undefined) {
    const nextEmail =
      params.login_email !== undefined ? patch.login_email : undefined;
    const nextPhone =
      params.login_phone !== undefined ? patch.login_phone : undefined;
    if (nextEmail === null && nextPhone === null) {
      throw new Error("Email or phone is required.");
    }
  }

  const { error } = await supabase.from("employee_accounts").update(patch).eq("id", accountId);
  if (error) throw new Error(error.message);

  const account = await getEmployeeAccountById(supabase, accountId);
  if (!account) throw new Error("Account not found.");
  return account;
}

export async function changeEmployeePassword(
  supabase: Supabase,
  accountId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const pwdErr = validatePasswordStrength(newPassword);
  if (pwdErr) throw new Error(pwdErr);

  const { data, error } = await supabase
    .from("employee_accounts")
    .select("password_hash, status")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || String(data.status) !== "active") {
    throw new Error("Account not active.");
  }

  const hash = data.password_hash != null ? String(data.password_hash) : "";
  if (!hash || !verifyPassword(currentPassword, hash)) {
    throw new Error("Current password is incorrect.");
  }

  const { error: updErr } = await supabase
    .from("employee_accounts")
    .update({
      password_hash: hashPassword(newPassword),
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (updErr) throw new Error(updErr.message);
}

/** Reserved for future OTP / self-service reset. */
export async function issuePasswordResetToken(
  supabase: Supabase,
  accountId: string,
  method: "link" | "otp" = "link",
): Promise<ActivationTokenResult> {
  const raw_token = generateAccountToken();
  const token_hash = hashAccountToken(raw_token);
  const expires_at = resetExpiresAt();

  const { error } = await supabase
    .from("employee_accounts")
    .update({
      reset_token_hash: token_hash,
      reset_token_expires_at: expires_at,
      reset_method: method,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);

  return { raw_token, expires_at };
}

/** @deprecated Admin no longer sets passwords directly. Use createPendingEmployeeAccount. */
export async function createEmployeeAccount(
  supabase: Supabase,
  params: {
    staff_id: string;
    company_id: string;
    login_email?: string | null;
    login_phone?: string | null;
    password: string;
  },
): Promise<EmployeeAccountRow> {
  const pwdErr = validatePasswordStrength(params.password);
  if (pwdErr) throw new Error(pwdErr);

  const email = normalizeEmail(params.login_email);
  const phone = normalizePhone(params.login_phone);
  if (!email && !phone) {
    throw new Error("Email or phone is required.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("employee_accounts")
    .insert({
      staff_id: params.staff_id,
      company_id: params.company_id,
      login_email: email,
      login_phone: phone,
      password_hash: hashPassword(params.password),
      password_set_at: now,
      status: "active",
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

/** @deprecated Use adminResetEmployeePassword instead. */
export async function updateEmployeeAccountPassword(
  supabase: Supabase,
  accountId: string,
  password: string,
): Promise<void> {
  const pwdErr = validatePasswordStrength(password);
  if (pwdErr) throw new Error(pwdErr);
  const { error } = await supabase
    .from("employee_accounts")
    .update({
      password_hash: hashPassword(password),
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}
