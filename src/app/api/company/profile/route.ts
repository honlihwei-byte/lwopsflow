import { NextResponse } from "next/server";
import {
  getPlanLimitsForCompany,
  getSubscriptionForCompany,
  resolveEffectiveStatus,
} from "@/lib/billing";
import { COMPANY_STATUS_LABELS } from "@/lib/company";
import { fetchCompanyById } from "@/lib/company-db";
import { getCompanyEmailVerificationInfo } from "@/lib/email-verification-sync";
import { isNextResponse, requireCompanyAdmin } from "@/lib/admin-api-auth";
import { planDisplayName } from "@/lib/subscription-plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

function formatIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

async function profileJsonForCompany(companyId: string) {
  const supabase = createAdminClient();
  const company = await fetchCompanyById(supabase, companyId);
  if (!company) return null;

  const sub = await getSubscriptionForCompany(supabase, company);
  const [limits, emailInfo] = await Promise.all([
    getPlanLimitsForCompany(supabase, companyId, sub),
    getCompanyEmailVerificationInfo(supabase, company),
  ]);

  const effectiveStatus = resolveEffectiveStatus(company, sub);
  const companyIdDisplay = company.login_id?.trim() || company.code;

  return {
    company_name: company.name,
    company_id: companyIdDisplay,
    owner_name: company.owner_name ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    registration_date: formatIsoDate(company.created_at),
    email_verified: emailInfo.email_verified,
    email_verified_at: formatIsoDate(emailInfo.email_verified_at),
    current_plan: planDisplayName(sub.plan_slug),
    plan_slug: sub.plan_slug,
    payment_status: sub.payment_status,
    trial_start: formatIsoDate(sub.trial_started_at ?? company.trial_started_at),
    trial_end: formatIsoDate(sub.trial_ends_at ?? company.trial_ends_at),
    subscription_expiry: formatIsoDate(sub.subscription_ends_at ?? company.subscription_ends_at),
    renewal_date: formatIsoDate(sub.subscription_ends_at ?? company.subscription_ends_at),
    next_billing_date: formatIsoDate(sub.next_billing_at),
    subscription_status: COMPANY_STATUS_LABELS[effectiveStatus] ?? effectiveStatus,
    staff_count: limits.staff_used,
    staff_limit: limits.max_staff,
    shop_count: limits.shop_used,
    shop_limit: limits.max_shops,
    account_status: COMPANY_STATUS_LABELS[effectiveStatus] ?? effectiveStatus,
    account_status_key: effectiveStatus,
    timezone: company.timezone ?? "Asia/Kuala_Lumpur",
    billing_contact_email: company.billing_contact_email ?? "",
    billing_contact_phone: company.billing_contact_phone ?? "",
  };
}

export async function GET(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const profile = await profileJsonForCompany(session.companyId!);
    if (!profile) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;

  try {
    const body = await req.json();
    const supabase = createAdminClient();
    const companyId = session.companyId!;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.company_name !== undefined) {
      const name = String(body.company_name).trim();
      if (!name) {
        return NextResponse.json({ error: "Company name cannot be empty." }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.owner_name !== undefined) {
      updates.owner_name = String(body.owner_name).trim() || null;
    }

    if (body.phone !== undefined) {
      updates.phone = String(body.phone).trim() || null;
    }

    if (body.timezone !== undefined) {
      const tz = String(body.timezone).trim();
      if (!tz) {
        return NextResponse.json({ error: "Timezone is required." }, { status: 400 });
      }
      updates.timezone = tz;
    }

    if (body.billing_contact_email !== undefined) {
      const raw = String(body.billing_contact_email).trim().toLowerCase();
      if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return NextResponse.json({ error: "Invalid billing contact email." }, { status: 400 });
      }
      updates.billing_contact_email = raw || null;
    }

    if (body.billing_contact_phone !== undefined) {
      updates.billing_contact_phone = String(body.billing_contact_phone).trim() || null;
    }

    const allowedKeys = new Set([
      "updated_at",
      "name",
      "owner_name",
      "phone",
      "timezone",
      "billing_contact_email",
      "billing_contact_phone",
    ]);
    const patchKeys = Object.keys(updates).filter((k) => k !== "updated_at");
    if (patchKeys.length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }
    for (const k of patchKeys) {
      if (!allowedKeys.has(k)) {
        return NextResponse.json({ error: `Field "${k}" cannot be edited.` }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("companies")
      .update(updates)
      .eq("id", companyId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const profile = await profileJsonForCompany(companyId);
    if (!profile) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
