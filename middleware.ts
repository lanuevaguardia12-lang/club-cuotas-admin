import { NextRequest, NextResponse } from "next/server";

import { LOGIN_PATH, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  const isLogin = pathname === LOGIN_PATH;

  if (isLogin && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    isLogin ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
