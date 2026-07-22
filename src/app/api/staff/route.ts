import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  allocateStaffCode,
  attachAssignments,
  listStaff,
  loadAssignmentsByStaff,
  parseShopIds,
  staffIdsWithAttendance,
  syncStaffShopAssignments,
} from "@/lib/staff";
import { parseScheduleFromBody, saveStaffSchedule } from "@/lib/staff-schedule-db";
import { isNextResponse } from "@/lib/admin-api-auth";
import { canAddStaff, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById } from "@/lib/company-db";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { ensureStaffPermissionProfile, loadStaffPermissionSummaries } from "@/lib/permissions/staff-permissions-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shop_id");

  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;
    if (shopId) {
      const deny = await assertShopScope(supabase, shopId, scope.companyId);
      if (deny) return deny;
    }
    const staff = await listStaff(supabase, {
      shopId: shopId || null,
      companyId: scope.companyId,
    });
    const summaries = await loadStaffPermissionSummaries(
      supabase,
      scope.companyId,
      staff.map((s) => s.id),
    );
    const enriched = staff.map((s) => ({
      ...s,
      permission_summary: summaries.get(s.id) ?? null,
    }));
    return NextResponse.json({ staff: enriched });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const company = await fetchCompanyById(supabase, scope.companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const sub = await getSubscriptionForCompany(supabase, company);
    const staffLimit = await canAddStaff(supabase, scope.companyId, company, sub);
    if (!staffLimit.ok) {
      return NextResponse.json({ error: staffLimit.message, code: "PLAN_LIMIT" }, { status: 403 });
    }

    const body = await req.json();
    const staffName = String(body.staff_name ?? "").trim();
    const staffTypeRaw = body.staff_type as string | undefined;
    const staffType =
      staffTypeRaw === "part_time" || staffTypeRaw === "full_time" ? staffTypeRaw : "full_time";
    const shopIds = parseShopIds(body as Record<string, unknown>);

    if (!staffName) {
      return NextResponse.json({ error: "staff_name is required" }, { status: 400 });
    }
    if (!shopIds || shopIds.length === 0) {
      return NextResponse.json({ error: "At least one shop assignment is required" }, { status: 400 });
    }

    const { data: shops, error: shopsErr } = await supabase
      .from("shops")
      .select("id")
      .in("id", shopIds)
      .eq("company_id", scope.companyId);
    if (shopsErr) {
      console.error(shopsErr);
      return NextResponse.json({ error: "Failed to verify shops" }, { status: 500 });
    }
    if ((shops ?? []).length !== shopIds.length) {
      return NextResponse.json({ error: "One or more shops not found" }, { status: 404 });
    }

    const staff_code = await allocateStaffCode(supabase);
    const id_card_qr_value = `card-${randomUUID()}`;

    const allowPunch = body.allow_punch !== false;
    const phone = body.phone != null ? String(body.phone).trim() || null : null;
    const reportingManager =
      body.reporting_manager != null ? String(body.reporting_manager).trim() || null : null;

    const { data, error } = await supabase
      .from("staff")
      .insert({
        staff_name: staffName,
        staff_code,
        staff_type: staffType,
        id_card_qr_value,
        status: "active",
        company_id: scope.companyId,
        phone,
        allow_punch: allowPunch,
        reporting_manager: reportingManager,
        schedule_mode: String(body.schedule_mode ?? "fixed_daily"),
        default_start_time: String(body.default_start_time ?? "09:00"),
        default_end_time: String(body.default_end_time ?? "18:00"),
      })
      .select(
        "id, staff_name, staff_code, staff_type, id_card_qr_value, status, created_at, updated_at",
      )
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json(
        {
          error: error.message || "Failed to create staff",
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    await syncStaffShopAssignments(supabase, data.id, shopIds);

    await ensureStaffPermissionProfile(supabase, {
      company_id: scope.companyId,
      staff_id: data.id,
    });

    try {
      const profile = parseScheduleFromBody(body as Record<string, unknown>);
      await saveStaffSchedule(supabase, data.id, profile);
    } catch (schedErr) {
      console.warn("staff schedule save skipped", schedErr);
    }

    const assignments = await loadAssignmentsByStaff(supabase, [data.id]);
    const withPunches = await staffIdsWithAttendance(supabase);
    const [staff] = attachAssignments([data], assignments, withPunches);

    return NextResponse.json({ staff });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
