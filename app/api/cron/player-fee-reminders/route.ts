import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const dataService = getDataService();
  const period = new Date().toISOString().slice(0, 7);
  const dashboard = await dataService.getDashboardData(period);
  const targetPlayers = dashboard.players.filter((player) => player.status !== "paid");
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const player of targetPlayers) {
    const subscriptions = await dataService.getPushSubscriptionsForPlayer(player.id);

    if (subscriptions.length === 0) {
      skipped += 1;
      continue;
    }

    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, {
          title: "Cuota pendiente",
          body: `Hola ${player.name}. Ya está disponible la cuota de ${formatPeriod(period)} por ${player.fee}.`,
          tag: `fee-reminder-${player.id}-${period}`,
          url: "/mi-cuota",
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        await maybeDeactivateExpiredSubscription(
          dataService,
          subscription.endpoint,
          error,
        );
      }
    }
  }

  if (sent > 0) {
    await dataService.createNotification({
      title: "Push de cuotas enviado",
      message: `${sent} notificaciones push enviadas para ${period}.`,
      type: failed > 0 ? "warning" : "success",
      targetRole: "all",
    });
  }

  await dataService.recordAuditEvent({
    actor: systemAuditActor,
    action: "reminder.sent",
    entityType: "reminder",
    entityId: period,
    summary: `Cron envio ${sent} push de cuota para ${period}.`,
    metadata: {
      failed,
      period,
      sent,
      skipped,
    },
  });

  return NextResponse.json({
    failed,
    period,
    sent,
    skipped,
  });
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

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
