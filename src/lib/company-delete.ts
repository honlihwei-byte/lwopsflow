import { DEFAULT_COMPANY_LOGIN_ID, normalizeCompanyLoginId } from "@/lib/company-auth";
import { PHOTO_PROOF_BUCKET } from "@/lib/photo-proof-storage";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

const STORAGE_REMOVE_BATCH = 100;

export class CompanyDeleteError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "CompanyDeleteError";
  }
}

export function isProtectedCompany(company: {
  login_id?: string | null;
  code?: string | null;
}): boolean {
  const loginId = normalizeCompanyLoginId(String(company.login_id ?? ""));
  if (loginId === DEFAULT_COMPANY_LOGIN_ID) return true;
  const code = String(company.code ?? "").trim().toUpperCase();
  return code === DEFAULT_COMPANY_LOGIN_ID || code === "CMP-000001";
}

async function deleteInBatches(
  supabase: Supabase,
  table: string,
  column: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw new CompanyDeleteError(error.message, 500);
  }
}

async function deletePhotoProofsForShops(supabase: Supabase, shopIds: string[]): Promise<void> {
  if (shopIds.length === 0) return;

  const { data, error } = await supabase
    .from("attendance")
    .select("photo_proof_path")
    .in("shop_id", shopIds)
    .eq("photo_proof_used", true)
    .not("photo_proof_path", "is", null);

  if (error) {
    console.warn("[company-delete] could not list photo paths:", error.message);
    return;
  }

  const paths = (data ?? [])
    .map((r) => String(r.photo_proof_path ?? "").trim())
    .filter((p) => p.length > 0);

  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
    const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH);
    const { error: storageErr } = await supabase.storage.from(PHOTO_PROOF_BUCKET).remove(batch);
    if (storageErr) {
      console.warn("[company-delete] storage remove batch failed:", storageErr.message);
    }
  }
}

async function deleteAuthUserIfPresent(
  supabase: Supabase,
  authUserId: string | null | undefined,
): Promise<{ authDeleted: boolean }> {
  if (!authUserId) return { authDeleted: false };
  try {
    const { error } = await supabase.auth.admin.deleteUser(authUserId);
    if (error) {
      console.warn("[company-delete] auth user delete failed:", error.message);
      return { authDeleted: false };
    }
    return { authDeleted: true };
  } catch (e) {
    console.warn("[company-delete] auth user delete exception:", e);
    return { authDeleted: false };
  }
}

/**
 * Permanently delete one company and all tenant data. Super Admin only (caller must enforce).
 * Does not load attendance rows for display — only deletes by shop/company scope.
 */
export async function deleteCompanyPermanently(
  supabase: Supabase,
  companyId: string,
): Promise<{ companyId: string; authDeleted: boolean }> {
  const id = companyId.trim();
  if (!id) throw new CompanyDeleteError("Company id is required.", 400);

  const { data: company, error: loadErr } = await supabase
    .from("companies")
    .select("id, name, login_id, code, auth_user_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) throw new CompanyDeleteError(loadErr.message, 500);
  if (!company) throw new CompanyDeleteError("Company not found.", 404);
  if (isProtectedCompany(company)) {
    throw new CompanyDeleteError("This company cannot be deleted (platform default account).", 403);
  }

  const authUserId = company.auth_user_id ? String(company.auth_user_id) : null;

  const { data: shops, error: shopsErr } = await supabase
    .from("shops")
    .select("id")
    .eq("company_id", id);
  if (shopsErr) throw new CompanyDeleteError(shopsErr.message, 500);
  const shopIds = (shops ?? []).map((s) => String(s.id));

  const { data: staffRows, error: staffListErr } = await supabase
    .from("staff")
    .select("id")
    .eq("company_id", id);
  if (staffListErr) throw new CompanyDeleteError(staffListErr.message, 500);
  const staffIds = (staffRows ?? []).map((s) => String(s.id));

  await deletePhotoProofsForShops(supabase, shopIds);

  if (shopIds.length > 0) {
    await deleteInBatches(supabase, "forgot_punch_requests", "shop_id", shopIds);
    await deleteInBatches(supabase, "attendance", "shop_id", shopIds);
  }

  const { error: trustedErr } = await supabase
    .from("staff_trusted_devices")
    .delete()
    .eq("company_id", id);
  if (trustedErr) throw new CompanyDeleteError(trustedErr.message, 500);

  const { error: schedulesErr } = await supabase.from("staff_schedules").delete().eq("company_id", id);
  if (schedulesErr) throw new CompanyDeleteError(schedulesErr.message, 500);

  if (staffIds.length > 0) {
    await deleteInBatches(supabase, "staff_schedule_slots", "staff_id", staffIds);
  }

  const { error: templatesErr } = await supabase
    .from("shop_shift_templates")
    .delete()
    .eq("company_id", id);
  if (templatesErr) throw new CompanyDeleteError(templatesErr.message, 500);

  if (shopIds.length > 0) {
    await deleteInBatches(supabase, "shop_gps_locations", "shop_id", shopIds);
    await deleteInBatches(supabase, "staff_shop_assignments", "shop_id", shopIds);
  }

  const { error: notifErr } = await supabase.from("notifications").delete().eq("company_id", id);
  if (notifErr) throw new CompanyDeleteError(notifErr.message, 500);

  const { error: staffErr } = await supabase.from("staff").delete().eq("company_id", id);
  if (staffErr) throw new CompanyDeleteError(staffErr.message, 500);

  const { error: shopsDelErr } = await supabase.from("shops").delete().eq("company_id", id);
  if (shopsDelErr) throw new CompanyDeleteError(shopsDelErr.message, 500);

  const { error: invoicesErr } = await supabase.from("invoices").delete().eq("company_id", id);
  if (invoicesErr) throw new CompanyDeleteError(invoicesErr.message, 500);

  const { error: paymentsErr } = await supabase.from("payments").delete().eq("company_id", id);
  if (paymentsErr) throw new CompanyDeleteError(paymentsErr.message, 500);

  const { error: subErr } = await supabase.from("subscriptions").delete().eq("company_id", id);
  if (subErr) throw new CompanyDeleteError(subErr.message, 500);

  const { error: emailTokErr } = await supabase
    .from("email_verification_tokens")
    .delete()
    .eq("company_id", id);
  if (emailTokErr) throw new CompanyDeleteError(emailTokErr.message, 500);

  const { error: cuErr } = await supabase
    .from("company_users")
    .delete()
    .eq("company_id", id)
    .neq("role", "super_admin");
  if (cuErr) throw new CompanyDeleteError(cuErr.message, 500);

  const { error: companyDelErr } = await supabase.from("companies").delete().eq("id", id);
  if (companyDelErr) throw new CompanyDeleteError(companyDelErr.message, 500);

  const { authDeleted } = await deleteAuthUserIfPresent(supabase, authUserId);

  return { companyId: id, authDeleted };
}
