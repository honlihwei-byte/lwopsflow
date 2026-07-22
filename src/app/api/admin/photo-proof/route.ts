import { NextResponse } from "next/server";
import { ATTENDANCE_SELECT } from "@/lib/attendance-db";
import { formatMalaysiaRecordedAt, malaysiaDateYmd, malaysiaDayUtcBounds } from "@/lib/malaysia-time";
import { PHOTO_PROOF_BUCKET } from "@/lib/photo-proof-storage";
import { gpsStatusLabel, type AttendanceRecord } from "@/lib/attendance";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

const SIGNED_URL_TTL_SEC = 3600;

function parseGpsFromAudit(notes: string | null | undefined): string {
  if (!notes) return "GPS: Not verified";
  const m = notes.match(/Photo proof[^.]*\.\s*(.+)$/i);
  return m?.[1] ? (m[1].startsWith("GPS:") ? m[1] : `GPS: ${m[1]}`) : notes;
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id");
    const staffId = url.searchParams.get("staff_id");
    const reviewOnly = url.searchParams.get("review_required") === "true";
    const todayOnly = url.searchParams.get("today") !== "false";
    const dayYmd = url.searchParams.get("day") ?? malaysiaDateYmd(new Date());

    let query = supabase
      .from("attendance")
      .select(ATTENDANCE_SELECT)
      .eq("photo_proof_used", true)
      .in("shop_id", scope.companyShopIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (shopId && shopId !== "__all__") query = query.eq("shop_id", shopId);
    if (staffId && staffId !== "__all__") query = query.eq("staff_id", staffId);
    if (reviewOnly) query = query.eq("review_required", true);

    if (todayOnly) {
      const { start, end } = malaysiaDayUtcBounds(dayYmd);
      query = query.gte("created_at", start).lte("created_at", end);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as AttendanceRecord[];
    const items = await Promise.all(
      rows.map(async (row) => {
        let photoUrl: string | null = null;
        if (row.photo_proof_path) {
          const { data: signed } = await supabase.storage
            .from(PHOTO_PROOF_BUCKET)
            .createSignedUrl(row.photo_proof_path, SIGNED_URL_TTL_SEC);
          photoUrl = signed?.signedUrl ?? null;
        }
        const gpsStatus = parseGpsFromAudit(
          (row as AttendanceRecord & { audit_notes?: string | null }).audit_notes,
        );
        return {
          id: row.id,
          shop_id: row.shop_id,
          shop_name: row.shop_name,
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          staff_code: row.staff_code,
          action_type: row.action_type,
          action_label: row.action_type === "clock_in" ? "Clock In" : "Clock Out",
          recorded_at: formatMalaysiaRecordedAt(row.created_at),
          verification_method: row.verification_method ?? "photo_proof",
          verification_label: "Photo Proof",
          gps_status: gpsStatus,
          gps_status_label: gpsStatusLabel(row),
          review_required: row.review_required === true,
          photo_url: photoUrl,
          photo_path: row.photo_proof_path,
        };
      }),
    );

    return NextResponse.json({ items, day: dayYmd });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
