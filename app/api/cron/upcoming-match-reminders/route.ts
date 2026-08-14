import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendUpcomingMatchReminderNotifications } from "@/lib/upcoming-match-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const result = await sendUpcomingMatchReminderNotifications({
    actor: systemAuditActor,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const cronAuthorized = isCronAuthorized(request);
  const user = cronAuthorized ? null : await getCurrentUser();

  if (!cronAuthorized && !user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user && user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede enviar pruebas de proximo partido." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    ignoreAlreadyNotified?: unknown;
    playerId?: unknown;
  };
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";

  if (!playerId) {
    return NextResponse.json({ message: "Tenes que indicar playerId." }, { status: 400 });
  }

  const result = await sendUpcomingMatchReminderNotifications({
    actor: user ? userToAuditActor(user) : systemAuditActor,
    forceNextMatch: true,
    ignoreAlreadyNotified: body.ignoreAlreadyNotified === true,
    targetPlayerId: playerId,
  });

  return NextResponse.json(result);
}

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  return Boolean(expected && authorization === `Bearer ${expected}`);
}
