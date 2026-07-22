import { NextResponse } from "next/server";

/**
 * Fallback for unknown /api/* paths — returns JSON instead of the global HTML not-found page.
 * Specific routes (e.g. /api/test-push) take precedence when deployed.
 */
function notFoundJson(path: string[]) {
  return NextResponse.json(
    {
      error: "API route not found",
      path: `/api/${path.join("/")}`,
      hint: "If this route was recently added, redeploy the application.",
    },
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notFoundJson(path);
}

export async function POST(_req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notFoundJson(path);
}

export async function PATCH(_req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notFoundJson(path);
}

export async function PUT(_req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notFoundJson(path);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notFoundJson(path);
}
