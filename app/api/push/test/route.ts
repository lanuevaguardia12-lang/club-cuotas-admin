import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronAuthorized = isCronAuthorized(request);
  const user = cronAuthorized ? null : await getCurrentUser();

  if (!cronAuthorized && !user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user?.role === "admin") {
    return NextResponse.json(
      { message: "Las notificaciones push no estan disponibles para administradores." },
      { status: 403 },
    );
  }

  const dataService = getDataService();
  const body = (await request.json().catch(() => ({}))) as { playerId?: unknown };
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  const subscriptions = cronAuthorized
    ? playerId
      ? await dataService.getPushSubscriptionsForPlayer(playerId)
      : []
    : await dataService.getPushSubscriptionsForUser(user!.id);

  if (cronAuthorized && !playerId) {
    return NextResponse.json({ message: "Tenes que indicar playerId." }, { status: 400 });
  }

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { message: "No hay dispositivos suscriptos." },
      { status: 404 },
    );
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await sendPushNotification(subscription, {
        title: "Notificaciones activas",
        body: cronAuthorized
          ? "Este dispositivo ya puede recibir avisos de La Nueva Guardia."
          : `Hola ${user!.name}. Este dispositivo ya puede recibir avisos de La Nueva Guardia.`,
        tag: `push-test-${cronAuthorized ? playerId : user!.id}`,
        url: "/mi-cuota",
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await maybeDeactivateExpiredSubscription(dataService, subscription.endpoint, error);
    }
  }

  await dataService
    .recordAuditEvent({
      actor: user ? userToAuditActor(user) : systemAuditActor,
      action: "notification.created",
      entityType: "notification",
      entityId: cronAuthorized ? playerId : user!.id,
      summary: "Notificacion push de prueba enviada.",
      metadata: {
        playerId: cronAuthorized ? playerId : (user?.playerId ?? ""),
        sent,
        failed,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ failed, sent });
}

function isCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  return Boolean(expected && authorization === `Bearer ${expected}`);
}

async function maybeDeactivateExpiredSubscription(
  dataService: ReturnType<typeof getDataService>,
  endpoint: string,
  error: unknown,
) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;

  if (statusCode === 404 || statusCode === 410) {
    await dataService.deletePushSubscription(endpoint).catch(() => undefined);
  }
}
