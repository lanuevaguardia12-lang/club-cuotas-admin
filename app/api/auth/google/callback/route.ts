import { NextRequest, NextResponse } from "next/server";
import { googleAuthConfig } from "@/lib/auth/google-config";
import { getCurrentUser } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import {
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_PATH,
  readGoogleFlow,
  verifyGoogleCode,
} from "@/lib/auth/google";
import { GoogleAuthStore } from "@/services/database/google-auth-store";
import { resolveGoogleUser } from "@/services/auth/google-user";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let origin: string;
  try {
    origin = googleAuthConfig().origin;
  } catch {
    return new NextResponse("El acceso con Google todavía no está disponible.", {
      status: 503,
    });
  }
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 303);
    response.cookies.set(GOOGLE_FLOW_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_FLOW_PATH,
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  let destination = "/login";
  try {
    const flow = await readGoogleFlow(
      request.cookies.get(GOOGLE_FLOW_COOKIE)?.value,
      request.nextUrl.searchParams.get("state"),
    );
    destination = flow.mode === "link" ? "/account" : "/login";
    const store = new GoogleAuthStore();
    const saved = await store.consumeFlow(flow.state);
    if (!saved || saved.mode !== flow.mode || saved.user_id !== flow.userId)
      return finish(`${destination}?google=expired`);
    if (request.nextUrl.searchParams.has("error"))
      return finish(`${destination}?google=cancelled`);
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) return finish(`${destination}?google=failed`);
    if (flow.mode === "link") {
      const current = await getCurrentUser();
      if (!current || current.id !== flow.userId)
        return finish("/login?google=session-changed&redirectTo=/account");
      if (!(await resolveGoogleUser(current.id)))
        return finish("/login?google=session-changed");
      const identity = await verifyGoogleCode(code, flow);
      await store.link(current.id, identity.subject, identity.email);
      return finish("/account?google=linked");
    }
    const identity = await verifyGoogleCode(code, flow);
    const userId = await store.userIdForSubject(identity.subject);
    const user = userId ? await resolveGoogleUser(userId) : null;
    if (!user) return finish("/login?google=not-linked&redirectTo=/account");
    const token = await createSessionToken(user);
    const response = finish(flow.returnTo);
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    const status =
      error instanceof Error && error.message === "GOOGLE_ALREADY_LINKED"
        ? "already-linked"
        : "failed";
    return finish(`${destination}?google=${status}`);
  }
}
