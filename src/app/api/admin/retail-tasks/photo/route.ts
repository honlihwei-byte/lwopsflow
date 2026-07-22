import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { TASK_PROOF_BUCKET } from "@/lib/retail-tasks/task-photo-storage";
import { createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SEC = 3600;

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const path = new URL(req.url).searchParams.get("path")?.trim();
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    if (!path.startsWith(`${scope.companyId}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase.storage
      .from(TASK_PROOF_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message ?? "Could not sign URL" }, { status: 404 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
