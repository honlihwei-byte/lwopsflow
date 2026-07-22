import { NextResponse } from "next/server";
import { ATTENDANCE_SELECT } from "@/lib/attendance-db";
import { formatMalaysiaRecordedAt, malaysiaDateYmd, malaysiaDayUtcBounds } from "@/lib/malaysia-time";
import { SELFIE_PROOF_BUCKET } from "@/lib/selfie-proof-storage";
import type { AttendanceRecord } from "@/lib/attendance";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

const SIGNED_URL_TTL_SEC = 3600;

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const shopId = url.searchParams.get("shop_id");
    const staffId = url.searchParams.get("staff_id");
    const highRiskOnly = url.searchParams.get("high_risk") === "true";
    const dayYmd = url.searchParams.get("day") ?? malaysiaDateYmd(new Date());

    let query = supabase
      .from("attendance")
      .select(ATTENDANCE_SELECT)
      .eq("selfie_proof_used", true)
      .in("shop_id", scope.companyShopIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (shopId && shopId !== "__all__") query = query.eq("shop_id", shopId);
    if (staffId && staffId !== "__all__") query = query.eq("staff_id", staffId);
    if (highRiskOnly) {
      query = query.or("risk_level.eq.high,buddy_punch_flag.eq.true,review_required.eq.true");
    }

    const { start, end } = malaysiaDayUtcBounds(dayYmd);
    query = query.gte("created_at", start).lte("created_at", end);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as AttendanceRecord[];
    const items = await Promise.all(
      rows.map(async (row) => {
        let selfieUrl: string | null = null;
        const path = (row as AttendanceRecord & { selfie_proof_path?: string | null })
          .selfie_proof_path;
        if (path) {
          const { data: signed } = await supabase.storage
            .from(SELFIE_PROOF_BUCKET)
            .createSignedUrl(path, SIGNED_URL_TTL_SEC);
          selfieUrl = signed?.signedUrl ?? null;
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
          verification_label: "Selfie Proof",
          risk_level: row.risk_level ?? "low",
          risk_score: row.risk_score ?? 0,
          review_required: row.review_required === true,
          buddy_punch_flag: row.buddy_punch_flag === true,
          selfie_url: selfieUrl,
        };
      }),
    );

    return NextResponse.json({ items, day: dayYmd });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
