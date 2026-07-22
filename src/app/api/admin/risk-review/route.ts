import { NextResponse } from "next/server";
import { ATTENDANCE_SELECT } from "@/lib/attendance-db";
import { gpsStatusLabel, type AttendanceRecord } from "@/lib/attendance";
import { RISK_FLAG_LABELS, parseRiskFlagsJson, type RiskFlag } from "@/lib/punch-risk";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { PHOTO_PROOF_BUCKET } from "@/lib/photo-proof-storage";
import { formatMalaysiaRecordedAt, malaysiaDateYmd, malaysiaDayUtcBounds } from "@/lib/malaysia-time";
import { createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SEC = 3600;

function riskReasons(flags: RiskFlag[]): string[] {
  return flags.map((f) => RISK_FLAG_LABELS[f] ?? f);
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id");
    const staffId = url.searchParams.get("staff_id");
    const reviewOnly = url.searchParams.get("review_required") !== "false";
    const todayOnly = url.searchParams.get("today") !== "false";
    const minRisk = url.searchParams.get("min_risk") ?? "medium";
    const dayYmd = url.searchParams.get("day") ?? malaysiaDateYmd(new Date());

    let query = supabase
      .from("attendance")
      .select(ATTENDANCE_SELECT)
      .in("shop_id", scope.companyShopIds)
      .order("created_at", { ascending: false })
      .limit(250);

    if (shopId && shopId !== "__all__") query = query.eq("shop_id", shopId);
    if (staffId && staffId !== "__all__") query = query.eq("staff_id", staffId);
    if (reviewOnly) query = query.eq("review_required", true);

    if (todayOnly) {
      const { start, end } = malaysiaDayUtcBounds(dayYmd);
      query = query.gte("created_at", start).lte("created_at", end);
    }

    if (minRisk === "high") {
      query = query.eq("risk_level", "high");
    } else if (minRisk === "medium") {
      query = query.in("risk_level", ["medium", "high"]);
    } else {
      query = query.or(
        "review_required.eq.true,risk_level.in.(medium,high),buddy_punch_flag.eq.true",
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as (AttendanceRecord & {
      risk_score?: number;
      risk_level?: string;
      device_trust_status?: string | null;
      buddy_punch_flag?: boolean;
      risk_flags?: unknown;
      punch_device_id?: string | null;
      punch_browser_info?: string | null;
      audit_notes?: string | null;
    })[];

    const items = await Promise.all(
      rows.map(async (row) => {
        const flags = parseRiskFlagsJson(row.risk_flags);
        let photoUrl: string | null = null;
        if (row.photo_proof_path) {
          const { data: signed } = await supabase.storage
            .from(PHOTO_PROOF_BUCKET)
            .createSignedUrl(row.photo_proof_path, SIGNED_URL_TTL_SEC);
          photoUrl = signed?.signedUrl ?? null;
        }

        return {
          id: row.id,
          shop_id: row.shop_id,
          shop_name: row.shop_name,
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          staff_code: row.staff_code,
          action_label: row.action_type === "clock_in" ? "Clock In" : "Clock Out",
          recorded_at: formatMalaysiaRecordedAt(row.created_at),
          risk_score: row.risk_score ?? 0,
          risk_level: row.risk_level ?? "low",
          risk_flags: flags,
          risk_reasons: riskReasons(flags),
          device_trust_status: row.device_trust_status,
          buddy_punch_flag: row.buddy_punch_flag === true,
          review_required: row.review_required === true,
          verification_method: row.verification_method,
          verification_label:
            row.verification_method === "random_selfie"
              ? "Random Selfie"
              : row.photo_proof_used
                ? "Photo Proof"
                : row.verification_method ?? "GPS",
          gps_status_label: gpsStatusLabel(row),
          photo_url: photoUrl,
          punch_device_id: row.punch_device_id ?? null,
          punch_browser_info: row.punch_browser_info ?? null,
          audit_notes: row.audit_notes ?? null,
        };
      }),
    );

    return NextResponse.json({ items, day: dayYmd });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
