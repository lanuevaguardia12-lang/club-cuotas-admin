import { NextRequest, NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission(request, "players:read");

  if (auth.response) {
    return auth.response;
  }

  const players = await getDataService().getPlayersData();

  return NextResponse.json({ data: players.players });
}
