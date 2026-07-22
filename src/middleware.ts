import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_APP_BASE_URL, isDisallowedAppHost, isEmployeeAppHost } from "@/lib/app-url";

const CANONICAL_HOST = new URL(DEFAULT_APP_BASE_URL).hostname;

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostName = host.split(":")[0]?.toLowerCase() ?? "";
  const { pathname, searchParams } = request.nextUrl;

  // Never rewrite or redirect API route handlers.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Old Vercel deployment URLs → canonical production domain (preserves path + QR token).
  if (
    process.env.VERCEL_ENV === "production" &&
    isDisallowedAppHost(hostName) &&
    hostName !== CANONICAL_HOST
  ) {
    const canonical = request.nextUrl.clone();
    canonical.protocol = "https:";
    canonical.host = CANONICAL_HOST;
    return NextResponse.redirect(canonical, 308);
  }

  if (isEmployeeAppHost(host)) {
    if (pathname === "/login") {
      return NextResponse.rewrite(new URL("/employee/login", request.url));
    }
    if (pathname === "/employee/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url, 308);
    }
  }

  if (pathname === "/employee/activate") {
    const token = searchParams.get("token")?.trim();
    if (token) {
      return NextResponse.redirect(
        new URL(`/activate/${encodeURIComponent(token)}`, request.url),
        308,
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|images|icons|manifest.webmanifest|sw.js).*)",
  ],
};
