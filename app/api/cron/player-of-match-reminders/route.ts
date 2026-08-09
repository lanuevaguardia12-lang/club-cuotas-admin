import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { sendOpenPlayerOfMatchNotifications } from "@/lib/player-of-match-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const result = await sendOpenPlayerOfMatchNotifications({
    actor: systemAuditActor,
    trigger: "cron",
  });

  return NextResponse.json(result);
}
