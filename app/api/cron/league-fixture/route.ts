import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { refreshLeagueFixtureCache } from "@/lib/league-fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";

  if (
    !expected ||
    Buffer.byteLength(authorization) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await refreshLeagueFixtureCache()) });
  } catch (error) {
    console.error("Scheduled league refresh failed", error);
    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo actualizar la liga. Se conserva la copia anterior.",
      },
      { status: 502 },
    );
  }
}
