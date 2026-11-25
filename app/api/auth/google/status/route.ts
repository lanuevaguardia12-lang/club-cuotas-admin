import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleAuthConfig, googleAuthEnabled } from "@/lib/auth/google-config";
import { GoogleAuthStore } from "@/services/database/google-auth-store";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!googleAuthEnabled())
    return NextResponse.json(
      { enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    return NextResponse.json(
      { enabled: true, ...(await new GoogleAuthStore().status(user.id)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "No pudimos consultar la vinculación." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!googleAuthEnabled())
    return NextResponse.json(
      { error: "Google todavía no está disponible." },
      { status: 503 },
    );
  if (request.headers.get("origin") !== googleAuthConfig().origin)
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    await new GoogleAuthStore().dismiss(user.id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "No pudimos guardar tu preferencia. Intentá nuevamente." },
      { status: 503 },
    );
  }
}
