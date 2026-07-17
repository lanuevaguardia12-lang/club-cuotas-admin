import { NextRequest, NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requireApiPermission(request, "players:read");

  if (auth.response) {
    return auth.response;
  }

  const { playerId } = await params;
  const year = Number(request.nextUrl.searchParams.get("year") ?? undefined);
  const profile = await getDataService().getPlayerProfile(
    playerId,
    Number.isFinite(year) ? year : undefined,
  );

  if (!profile) {
    return NextResponse.json({ message: "Jugador no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data: profile });
}
