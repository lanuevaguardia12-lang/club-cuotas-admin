import "server-only";

import { isPushConfigured, sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { IDataService } from "@/services/IDataService";
import type { FeePlayerCalculation } from "@/types/fee-calculator";
import type { AuditActor } from "@/types/premium";

const NEW_FEE_NOTIFICATION_TITLE = "Ya está definida tu cuota";
const NEW_FEE_NOTIFICATION_URL = "/mi-cuota";

export interface SendDefinedFeeNotificationsResult {
  failed: number;
  notificationsCreated: number;
  period: string;
  pushSent: number;
  skippedAlreadyNotified: number;
  skippedNoPush: number;
  skippedPaid: number;
  skippedUndefined: boolean;
  targetPlayers: number;
}

export async function sendDefinedFeeNotifications({
  actor,
  period,
  trigger,
}: {
  actor: AuditActor;
  period: string;
  trigger: "calculator" | "cron" | "manual";
}): Promise<SendDefinedFeeNotificationsResult> {
  const dataService = getDataService();
  const [dashboard, feeCalculatorData, premium] = await Promise.all([
    dataService.getDashboardData(period),
    dataService.getFeeCalculatorData(period),
    dataService.getPremiumData(),
  ]);

  if (feeCalculatorData.summary.quotaStatus !== "defined") {
    return buildEmptyResult(period, { skippedUndefined: true });
  }

  const activePlayerIds = new Set(
    feeCalculatorData.players
      .filter((player) => player.status === "active")
      .map((player) => player.id),
  );
  const paidPlayerIds = new Set(
    dashboard.players
      .filter((player) => player.status === "paid")
      .map((player) => player.id),
  );
  const existingReferenceIds = new Set(
    premium.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const targetCalculations = feeCalculatorData.playerCalculations.filter(
    (calculation) =>
      activePlayerIds.has(calculation.playerId) && calculation.finalQuota > 0,
  );
  const result = buildEmptyResult(period, {
    targetPlayers: targetCalculations.length,
  });

  for (const calculation of targetCalculations) {
    if (paidPlayerIds.has(calculation.playerId)) {
      result.skippedPaid += 1;
      continue;
    }

    const referenceId = buildDefinedFeeReferenceId(calculation, period);

    if (existingReferenceIds.has(referenceId)) {
      result.skippedAlreadyNotified += 1;
      continue;
    }

    const message = buildDefinedFeeNotificationMessage(calculation, period);

    await dataService.createNotification({
      title: NEW_FEE_NOTIFICATION_TITLE,
      message,
      type: "info",
      targetRole: "player",
      targetPlayerId: calculation.playerId,
      referenceId,
      url: NEW_FEE_NOTIFICATION_URL,
    });
    existingReferenceIds.add(referenceId);
    result.notificationsCreated += 1;

    const subscriptions = await dataService.getPushSubscriptionsForPlayer(
      calculation.playerId,
    );

    if (subscriptions.length === 0 || !isPushConfigured()) {
      result.skippedNoPush += 1;
      continue;
    }

    for (const subscription of subscriptions) {
      try {
        await sendPushNotification(subscription, {
          title: NEW_FEE_NOTIFICATION_TITLE,
          body: message,
          tag: referenceId,
          url: NEW_FEE_NOTIFICATION_URL,
        });
        result.pushSent += 1;
      } catch (error) {
        result.failed += 1;
        await maybeDeactivateExpiredSubscription(
          dataService,
          subscription.endpoint,
          error,
        );
      }
    }
  }

  if (result.notificationsCreated > 0 || result.pushSent > 0 || result.failed > 0) {
    await dataService
      .recordAuditEvent({
        actor,
        action: "notification.created",
        entityType: "notification",
        entityId: `fee-defined:${period}`,
        summary: `${trigger} genero ${result.notificationsCreated} notificaciones de cuota definida para ${period}.`,
        metadata: {
          failed: result.failed,
          notificationsCreated: result.notificationsCreated,
          period,
          pushSent: result.pushSent,
          skippedAlreadyNotified: result.skippedAlreadyNotified,
          skippedNoPush: result.skippedNoPush,
          skippedPaid: result.skippedPaid,
          targetPlayers: result.targetPlayers,
          trigger,
        },
      })
      .catch(() => undefined);
  }

  return result;
}

export function getNextPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));

  return nextMonth.toISOString().slice(0, 7);
}

function buildEmptyResult(
  period: string,
  overrides: Partial<SendDefinedFeeNotificationsResult> = {},
): SendDefinedFeeNotificationsResult {
  return {
    failed: 0,
    notificationsCreated: 0,
    period,
    pushSent: 0,
    skippedAlreadyNotified: 0,
    skippedNoPush: 0,
    skippedPaid: 0,
    skippedUndefined: false,
    targetPlayers: 0,
    ...overrides,
  };
}

function buildDefinedFeeReferenceId(calculation: FeePlayerCalculation, period: string) {
  return `fee-defined:${calculation.playerId}:${period}:${Math.round(
    calculation.finalQuota * 100,
  )}`;
}

function buildDefinedFeeNotificationMessage(
  calculation: FeePlayerCalculation,
  period: string,
) {
  return `${calculation.playerName}, ya está definida tu cuota para el mes de ${formatPeriod(
    period,
  )} es de ${formatCurrency(calculation.finalQuota)}. Hace click y registra tu pago.`;
}

async function maybeDeactivateExpiredSubscription(
  dataService: IDataService,
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
