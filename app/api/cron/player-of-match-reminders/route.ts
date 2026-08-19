import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import {
  expirePlayerOfMatchCache,
  sendOpenPlayerOfMatchNotifications,
} from "@/lib/player-of-match-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    expirePlayerOfMatchCache();

    const result = await sendOpenPlayerOfMatchNotifications({
      actor: systemAuditActor,
      includeDetails: request.nextUrl.searchParams.get("details") === "1",
      notificationStage: parseNotificationStage(
        request.nextUrl.searchParams.get("stage"),
      ),
      trigger: "cron",
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
      { message: "Solo un administrador puede enviar pruebas de MVP." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    all?: unknown;
    includeDetails?: unknown;
    ignoreAlreadyNotified?: unknown;
    playerId?: unknown;
    stage?: unknown;
    userId?: unknown;
  };
  const all = body.all === true;
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if ((playerId && userId) || (all && (playerId || userId))) {
    return NextResponse.json(
      { message: "Usá all, playerId o userId. Solo una opción por vez." },
      { status: 400 },
    );
  }

  if (!all && !playerId && !userId) {
    return NextResponse.json(
      { message: "Tenes que indicar all:true, playerId o userId." },
      { status: 400 },
    );
  }

  try {
    expirePlayerOfMatchCache();

    const result = await sendOpenPlayerOfMatchNotifications({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      includeDetails: body.includeDetails === true,
      ignoreAlreadyNotified: body.ignoreAlreadyNotified === true,
      notificationStage:
        typeof body.stage === "string" ? parseNotificationStage(body.stage) : undefined,
      targetPlayerId: playerId || undefined,
      targetUserId: userId || undefined,
      trigger: "manual",
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

function parseNotificationStage(value: string | null | undefined) {
  return value === "opening" ||
    value === "midpoint" ||
    value === "closing" ||
    value === "auto"
    ? value
    : undefined;
}

function buildCronErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Error desconocido.",
      message: "No se pudo enviar la notificacion de MVP.",
    },
    { status: 500 },
  );
}
