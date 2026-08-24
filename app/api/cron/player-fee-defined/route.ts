import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendDefinedFeeNotifications } from "@/lib/fee-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await sendDefinedFeeNotifications({
      actor: systemAuditActor,
      period: getArgentinaCurrentPeriod(),
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
      { message: "Solo un administrador puede enviar pruebas de cuota definida." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { period?: unknown };
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : getArgentinaCurrentPeriod();

  try {
    const result = await sendDefinedFeeNotifications({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      period,
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

function getArgentinaCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}`;
}

function buildCronErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Error desconocido.",
      message: "No se pudo enviar la notificación de cuota definida.",
    },
    { status: 500 },
  );
}
