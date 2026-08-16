import { NextResponse } from "next/server";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role !== "player") {
    return NextResponse.json(
      { message: "Las notificaciones push son solo para jugadores." },
      { status: 403 },
    );
  }

  const dataService = getDataService();
  const subscriptions = await dataService.getPushSubscriptionsForUser(user.id);

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
        body: `Hola ${user.name}. Este dispositivo ya puede recibir avisos de La Nueva Guardia.`,
        tag: `push-test-${user.id}`,
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
      actor: userToAuditActor(user),
      action: "notification.created",
      entityType: "notification",
      entityId: user.id,
      summary: "Notificacion push de prueba enviada.",
      metadata: {
        sent,
        failed,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ failed, sent });
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
