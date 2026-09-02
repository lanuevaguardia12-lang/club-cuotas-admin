import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor, userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import {
  hasAlreadySentDefinedFeeNotification,
  sendDefinedFeeNotifications,
} from "@/lib/fee-notifications";
import { isPushConfigured, sendPushNotification } from "@/lib/push";
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
    period: getArgentinaCurrentPeriod(),
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
      : getArgentinaCurrentPeriod();

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
  const [dashboard, feeCalculatorData, premium] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getFeeCalculatorData(period),
    dataService.getPremiumData(),
  ]);
  const existingReferenceIds = new Set(
    premium.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const definedReferenceIdsBeforeBackfill = new Set(existingReferenceIds);
  const emptyResult = {
    definedNotificationsBackfilled: 0,
    failed: 0,
    notificationRecordsFailed: 0,
    notificationsCreated: 0,
    period,
    sent: 0,
    skippedNoDefinedNotification: 0,
    skippedNoPush: 0,
    skippedUndefined: false,
    throttled: 0,
    totalPending: 0,
  };

  if (feeCalculatorData.summary.quotaStatus !== "defined") {
    await dataService.recordAuditEvent({
      actor,
      action: "reminder.sent",
      entityType: "reminder",
      entityId: period,
      summary: `${trigger === "cron" ? "Cron" : "Admin"} no envio cuotas pendientes porque la cuota de ${period} no esta definida.`,
      metadata: {
        period,
        skippedUndefined: true,
        trigger,
      },
    });

    return NextResponse.json({
      ...emptyResult,
      skippedUndefined: true,
    });
  }

  const definedResult = await sendDefinedFeeNotifications({
    actor,
    period,
    trigger: trigger === "cron" ? "cron" : "manual",
  });
  const activePlayerIds = new Set(
    feeCalculatorData.players
      .filter((player) => player.status === "active")
      .map((player) => player.id),
  );
  const chargedPlayerIds = new Set(
    feeCalculatorData.playerCalculations
      .filter(
        (calculation) =>
          activePlayerIds.has(calculation.playerId) && calculation.finalQuota > 0,
      )
      .map((calculation) => calculation.playerId),
  );
  const pendingPlayers = dashboard.players.filter(
    (player) => player.status !== "paid" && chargedPlayerIds.has(player.id),
  );
  const targetPlayers = pendingPlayers.filter((player) => {
    return (
      trigger === "manual" ||
      !hasRecentFeePushReminder(premium.reminders, player.id, period)
    );
  });
  let sent = 0;
  let notificationsCreated = 0;
  let notificationRecordsFailed = 0;
  let skippedNoDefinedNotification = 0;
  let skippedNoPush = 0;
  const alreadyNotifiedToday = new Set<string>();
  let failed = 0;
  const throttled = pendingPlayers.filter(
    (player) =>
      trigger === "cron" &&
      hasRecentFeePushReminder(premium.reminders, player.id, period),
  ).length;

  for (const player of targetPlayers) {
    if (
      !hasAlreadySentDefinedFeeNotification(
        definedReferenceIdsBeforeBackfill,
        player.id,
        period,
      )
    ) {
      skippedNoDefinedNotification += 1;
      continue;
    }

    const subscriptions = await dataService.getPushSubscriptionsForPlayer(player.id);
    const message = buildPendingFeeNotificationMessage(player.name, player.fee, period);
    const referenceId = buildPendingFeeReferenceId(player.id, period);
    let playerSent = 0;

    if (
      !existingReferenceIds.has(referenceId) &&
      !alreadyNotifiedToday.has(referenceId)
    ) {
      try {
        await dataService.createNotification({
          title: "Cuota pendiente",
          message,
          type: "warning",
          targetRole: "player",
          targetPlayerId: player.id,
          referenceId,
          url: "/mi-cuota",
        });
        existingReferenceIds.add(referenceId);
        alreadyNotifiedToday.add(referenceId);
        notificationsCreated += 1;
      } catch {
        notificationRecordsFailed += 1;
      }
    }

    if (subscriptions.length === 0 || !isPushConfigured()) {
      skippedNoPush += 1;
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
    }
  }

  await dataService.recordAuditEvent({
    actor,
    action: "reminder.sent",
    entityType: "reminder",
    entityId: period,
    summary: `${trigger === "cron" ? "Cron" : "Admin"} envio ${sent} push de cuota para ${period}.`,
    metadata: {
      failed,
      notificationRecordsFailed,
      notificationsCreated,
      period,
      sent,
      skippedNoDefinedNotification,
      skippedNoPush,
      throttled,
      trigger,
    },
  });

  return NextResponse.json({
    definedNotificationsBackfilled: definedResult.notificationsCreated,
    failed,
    notificationRecordsFailed,
    notificationsCreated,
    period,
    sent,
    skippedNoDefinedNotification,
    skippedNoPush,
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

function getArgentinaCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}`;
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
  return `Hola, ${playerName}. Tenés pendiente la cuota de ${formatPeriod(
    period,
  )}. El monto es ${fee}. Hacé el pago y registralo en la app para dejarla al día.`;
}

function buildPendingFeeReferenceId(playerId: string, period: string) {
  return `fee-reminder:${playerId}:${period}:${getArgentinaTodayDate()}`;
}

function getArgentinaTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
