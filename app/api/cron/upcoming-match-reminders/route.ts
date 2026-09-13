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

  try {
    const result = await sendUpcomingMatchReminderNotifications({
      actor: systemAuditActor,
    });

    return NextResponse.json(result);
  } catch (error) {
    return buildCronErrorResponse(error);
  }
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
    all?: unknown;
    ignoreAlreadyNotified?: unknown;
    playerId?: unknown;
  };
  const all = body.all === true;
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";

  if (all && playerId) {
    return NextResponse.json(
      { message: "Usá all:true o playerId. Solo una opción por vez." },
      { status: 400 },
    );
  }

  if (!all && !playerId) {
    return NextResponse.json(
      { message: "Tenes que indicar all:true o playerId." },
      { status: 400 },
    );
  }

  try {
    const result = await sendUpcomingMatchReminderNotifications({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      forceNextMatch: true,
      ignoreAlreadyNotified: body.ignoreAlreadyNotified === true,
      targetPlayerId: playerId || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return buildCronErrorResponse(error);
  }
}

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  return Boolean(expected && authorization === `Bearer ${expected}`);
}

function buildCronErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Error desconocido.",
      message: "No se pudo enviar la notificacion de proximo partido.",
    },
    { status: 500 },
  );
}
