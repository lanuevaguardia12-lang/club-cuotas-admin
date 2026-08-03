import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { AuditActor, ReminderJob } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUSH_REMINDER_INTERVAL_DAYS = 4;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  return sendPendingFeePushNotifications({
    actor: systemAuditActor,
    period: getCurrentPeriod(),
    trigger: "cron",
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { message: "Solo un administrador puede enviar notificaciones masivas." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { period?: unknown };
  const period =
    typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : getCurrentPeriod();

  return sendPendingFeePushNotifications({
    actor: userToAuditActor(user),
    period,
    trigger: "manual",
  });
}

async function sendPendingFeePushNotifications({
  actor,
  period,
  trigger,
}: {
  actor: AuditActor;
  period: string;
  trigger: "cron" | "manual";
}) {
  const dataService = getDataService();
  const [dashboard, premium] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getPremiumData(),
  ]);
  const pendingPlayers = dashboard.players.filter((player) => player.status !== "paid");
  const targetPlayers = pendingPlayers.filter((player) => {
    return (
      trigger === "manual" ||
      !hasRecentFeePushReminder(premium.reminders, player.id, period)
    );
  });
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const throttled = pendingPlayers.filter(
    (player) =>
      trigger === "cron" &&
      hasRecentFeePushReminder(premium.reminders, player.id, period),
  ).length;

  for (const player of targetPlayers) {
    const subscriptions = await dataService.getPushSubscriptionsForPlayer(player.id);
    const message = buildPendingFeeNotificationMessage(player.name, player.fee, period);
    let playerSent = 0;

    if (subscriptions.length === 0) {
      skipped += 1;
      continue;
    }

    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, {
          title: "Cuota pendiente",
          body: message,
          tag: `fee-reminder-${player.id}-${period}`,
          url: "/mi-cuota",
        });
        sent += 1;
        playerSent += 1;
      } catch (error) {
        failed += 1;
        await maybeDeactivateExpiredSubscription(
          dataService,
          subscription.endpoint,
          error,
        );
      }
    }

    if (playerSent > 0) {
      await dataService.createReminderJob({
        scheduledFor: new Date().toISOString(),
        period,
        playerId: player.id,
        playerName: player.name,
        phone: player.phone,
        paymentStatus: player.status,
        message,
        status: "sent",
      });
      await dataService.createNotification({
        title: "Cuota pendiente",
        message,
        type: "warning",
        targetRole: "player",
        targetPlayerId: player.id,
        referenceId: `fee:${player.id}:${period}:${new Date().toISOString().slice(0, 10)}`,
        url: "/mi-cuota",
      });
    }
  }

  if (sent > 0) {
    await dataService.createNotification({
      title: "Push de cuotas enviado",
      message: `${sent} notificaciones push enviadas para ${period} (${trigger}).`,
      type: failed > 0 ? "warning" : "success",
      targetRole: "all",
    });
  }

  await dataService.recordAuditEvent({
    actor,
    action: "reminder.sent",
    entityType: "reminder",
    entityId: period,
    summary: `${trigger === "cron" ? "Cron" : "Admin"} envio ${sent} push de cuota para ${period}.`,
    metadata: {
      failed,
      period,
      sent,
      skipped,
      throttled,
      trigger,
    },
  });

  return NextResponse.json({
    failed,
    period,
    sent,
    skipped,
    throttled,
    totalPending: pendingPlayers.length,
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

function getCurrentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function hasRecentFeePushReminder(
  reminders: ReminderJob[],
  playerId: string,
  period: string,
) {
  const cutoff = Date.now() - PUSH_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

  return reminders.some((reminder) => {
    if (
      reminder.playerId !== playerId ||
      reminder.period !== period ||
      reminder.status !== "sent" ||
      !reminder.message.includes("no te lleguen estas notificaciones")
    ) {
      return false;
    }

    const sentAt = reminder.sentAt ?? reminder.createdAt;
    const timestamp = new Date(sentAt).getTime();

    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function buildPendingFeeNotificationMessage(
  playerName: string,
  fee: string,
  period: string,
) {
  return `Hola, ${playerName}, recorda que tenes la cuota del mes ${formatPeriod(period)} impaga. Tu cuota es de ${fee}. Hace el pago y llena el formulario para que no te lleguen estas notificaciones.`;
}
