import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  attachAssignments,
  loadAssignmentsByStaff,
  parseShopIds,
  staffIdsWithAttendance,
  syncStaffShopAssignments,
} from "@/lib/staff";
import { parseScheduleFromBody, saveStaffSchedule } from "@/lib/staff-schedule-db";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staffRow, error: staffErr } = await supabase
      .from("staff")
      .select("id, company_id")
      .eq("id", staffId)
      .maybeSingle();
    if (staffErr) {
      console.error(staffErr);
      return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
    }
    if (!staffRow || staffRow.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.staff_name !== undefined) {
      const name = String(body.staff_name).trim();
      if (!name) {
        return NextResponse.json({ error: "staff_name cannot be empty" }, { status: 400 });
      }
      updates.staff_name = name;
    }

    if (body.staff_type !== undefined) {
      if (body.staff_type !== "full_time" && body.staff_type !== "part_time") {
        return NextResponse.json({ error: "staff_type must be full_time or part_time" }, { status: 400 });
      }
      updates.staff_type = body.staff_type;
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "inactive") {
        return NextResponse.json({ error: "status must be active or inactive" }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.regenerate_id_card === true) {
      updates.id_card_qr_value = `card-${randomUUID()}`;
    }

    if (body.phone !== undefined) {
      updates.phone = String(body.phone).trim() || null;
    }

    if (body.allow_punch !== undefined) {
      updates.allow_punch = body.allow_punch !== false;
    }

    if (body.reporting_manager !== undefined) {
      updates.reporting_manager = String(body.reporting_manager).trim() || null;
    }

    if (body.schedule_mode !== undefined) {
      updates.schedule_mode = String(body.schedule_mode);
    }

    if (body.default_start_time !== undefined) {
      updates.default_start_time = String(body.default_start_time).slice(0, 5);
    }

    if (body.default_end_time !== undefined) {
      updates.default_end_time = String(body.default_end_time).slice(0, 5);
    }

    const shopIds = body.shop_ids !== undefined ? parseShopIds(body as Record<string, unknown>) : undefined;
    const hasSchedulePayload =
      body.schedule_mode !== undefined ||
      body.default_start_time !== undefined ||
      body.default_end_time !== undefined ||
      body.schedule_slots !== undefined;

    if (Object.keys(updates).length === 0 && shopIds === undefined && !hasSchedulePayload) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (shopIds !== null && shopIds !== undefined) {
      if (shopIds.length === 0) {
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
    }

    let data = null;
    if (Object.keys(updates).length > 0) {
      const { data: updated, error } = await supabase
        .from("staff")
        .update(updates)
        .eq("id", staffId)
        .select(
          "id, staff_name, staff_code, staff_type, id_card_qr_value, status, created_at, updated_at",
        )
        .maybeSingle();

      if (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
      }
      if (!updated) {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }
      data = updated;
    } else {
      const { data: existing, error } = await supabase
        .from("staff")
        .select(
          "id, staff_name, staff_code, staff_type, id_card_qr_value, status, created_at, updated_at",
        )
        .eq("id", staffId)
        .maybeSingle();
      if (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
      }
      if (!existing) {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }
      data = existing;
    }

    if (shopIds !== null && shopIds !== undefined) {
      await syncStaffShopAssignments(supabase, staffId, shopIds);
    }

    if (hasSchedulePayload) {
      try {
        const profile = parseScheduleFromBody(body as Record<string, unknown>);
        await saveStaffSchedule(supabase, staffId, profile, {
          phone: body.phone !== undefined ? String(body.phone).trim() || null : undefined,
          allow_punch: body.allow_punch !== undefined ? body.allow_punch !== false : undefined,
          reporting_manager:
            body.reporting_manager !== undefined
              ? String(body.reporting_manager).trim() || null
              : undefined,
        });
      } catch (schedErr) {
        const msg = schedErr instanceof Error ? schedErr.message : "Invalid schedule";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    const assignments = await loadAssignmentsByStaff(supabase, [staffId]);
    const withPunches = await staffIdsWithAttendance(supabase);
    const [staff] = attachAssignments([data], assignments, withPunches);

    return NextResponse.json({ staff });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data: staffRow, error: staffErr } = await supabase
      .from("staff")
      .select("id, company_id")
      .eq("id", staffId)
      .maybeSingle();
    if (staffErr) {
      console.error(staffErr);
      return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
    }
    if (!staffRow || staffRow.company_id !== scope.companyId) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const { count, error: cErr } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId);

    if (cErr) {
      console.error(cErr);
      return NextResponse.json({ error: "Could not verify attendance" }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot delete staff with attendance history. Set inactive instead." },
        { status: 409 },
      );
    }

    const { error } = await supabase.from("staff").delete().eq("id", staffId);
    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Failed to delete staff" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
