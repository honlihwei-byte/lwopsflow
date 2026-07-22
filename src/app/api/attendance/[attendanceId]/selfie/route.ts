import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import { SELFIE_PROOF_BUCKET } from "@/lib/selfie-proof-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

const SIGNED_URL_TTL_SEC = 3600;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ attendanceId: string }> },
) {
  const { attendanceId } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const { data, error } = await supabase
      .from("attendance")
      .select("id, shop_id, selfie_proof_used, selfie_proof_path, selfie_captured_at")
      .eq("id", attendanceId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.selfie_proof_path) {
      if (data?.selfie_captured_at) {
        return NextResponse.json(
          {
            error: "Selfie upload is still pending for this punch.",
            pending: true,
            selfie_captured_at: data.selfie_captured_at,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: "No selfie proof for this record." }, { status: 404 });
    }

    const deny = await assertShopScope(supabase, String(data.shop_id), scope.companyId);
    if (deny) return deny;

    const { data: signed, error: signErr } = await supabase.storage
      .from(SELFIE_PROOF_BUCKET)
      .createSignedUrl(data.selfie_proof_path, SIGNED_URL_TTL_SEC);

    if (signErr || !signed?.signedUrl) {
      console.error(signErr);
      return NextResponse.json({ error: "Could not load selfie." }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      path: data.selfie_proof_path,
      expires_in: SIGNED_URL_TTL_SEC,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}
