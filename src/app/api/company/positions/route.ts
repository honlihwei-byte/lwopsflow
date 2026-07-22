import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  createCompanyPosition,
  listCompanyPositions,
} from "@/lib/permissions/company-positions-db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("include_archived") === "1";

    const positions = await listCompanyPositions(supabase, scope.companyId, {
      includeArchived,
    });
    return NextResponse.json({ positions });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Position name is required" }, { status: 400 });
    }

    const position = await createCompanyPosition(supabase, {
      company_id: scope.companyId,
      name,
    });

    return NextResponse.json({ position });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
