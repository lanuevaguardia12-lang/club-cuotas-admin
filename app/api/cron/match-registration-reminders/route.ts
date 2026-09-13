import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendLatestCoachMatchRegistrationReminder } from "@/lib/match-registration-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await sendLatestCoachMatchRegistrationReminder({
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
      { message: "Solo un administrador puede enviar recordatorios al DT." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    ignoreAlreadyNotified?: unknown;
  };

  try {
    const result = await sendLatestCoachMatchRegistrationReminder({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      ignoreAlreadyNotified: body.ignoreAlreadyNotified === true,
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
      message: "No se pudo enviar el recordatorio de carga de jugadores al DT.",
    },
    { status: 500 },
  );
}
