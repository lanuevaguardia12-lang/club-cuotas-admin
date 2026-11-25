import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleAuthConfig } from "@/lib/auth/google-config";
import {
  createGoogleFlow,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_PATH,
} from "@/lib/auth/google";
import { GoogleAuthStore } from "@/services/database/google-auth-store";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  let origin: string;
  try {
    origin = googleAuthConfig().origin;
  } catch {
    return NextResponse.json(
      { error: "El acceso con Google todavía no está disponible." },
      { status: 503 },
    );
  }
  if (request.headers.get("origin") !== origin)
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const data = await request.formData();
  const mode = data.get("mode");
  if (mode !== "login" && mode !== "link")
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const user = await getCurrentUser();
  if (mode === "link" && !user)
    return NextResponse.redirect(new URL("/login?redirectTo=/account", origin), 303);
  try {
    const { flow, cookie, url } = await createGoogleFlow(
      mode,
      mode === "link" ? user!.id : null,
      mode === "link" ? "/account" : String(data.get("redirectTo") ?? "/"),
    );
    await new GoogleAuthStore().createFlow(flow.state, mode, flow.userId);
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(GOOGLE_FLOW_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_FLOW_PATH,
      maxAge: 600,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(
      new URL(`${mode === "link" ? "/account" : "/login"}?google=failed`, origin),
      303,
    );
  }
}
