import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendBirthdayNotifications } from "@/lib/birthday-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await sendBirthdayNotifications({
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
      { message: "Solo un administrador puede enviar pruebas de cumpleaños." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    date?: unknown;
    ignoreAlreadyNotified?: unknown;
    playerId?: unknown;
    userId?: unknown;
  };
  const dateIso = typeof body.date === "string" ? body.date.trim() : undefined;
  const targetPlayerId =
    typeof body.playerId === "string" ? body.playerId.trim() : undefined;
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : undefined;

  if (dateIso && !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return NextResponse.json(
      { message: "La fecha tiene que tener formato YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (targetPlayerId && targetUserId) {
    return NextResponse.json(
      { message: "Usá playerId o userId. Solo una opción por vez." },
      { status: 400 },
    );
  }

  try {
    const result = await sendBirthdayNotifications({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      dateIso,
      ignoreAlreadyNotified: body.ignoreAlreadyNotified === true,
      targetPlayerId,
      targetUserId,
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
      message: "No se pudo enviar la notificación de cumpleaños.",
    },
    { status: 500 },
  );
}
