import "server-only";

import { unstable_expireTag } from "next/cache";

import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type {
  AppNotification,
  AuditActor,
  PushSubscriptionRecord,
} from "@/types/premium";

const MVP_REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

export interface SendOpenPlayerOfMatchNotificationsResult {
  failed: number;
  matches: number;
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
  skippedAlreadyNotified: number;
  skippedNoPendingMatches: number;
  targetPlayerId?: string;
  targetUserId?: string;
  userDataFailed: number;
  users: number;
}

export async function sendOpenPlayerOfMatchNotifications({
  actor,
  ignoreAlreadyNotified = false,
  targetPlayerId,
  targetUserId,
  trigger,
}: {
  actor: AuditActor;
  ignoreAlreadyNotified?: boolean;
  targetPlayerId?: string;
  targetUserId?: string;
  trigger: "cron" | "match-update" | "manual" | "webhook";
}): Promise<SendOpenPlayerOfMatchNotificationsResult> {
  const dataService = getDataService();
  const [subscriptions, premium] = await Promise.all([
    targetPlayerId
      ? dataService.getPushSubscriptionsForPlayer(targetPlayerId)
      : targetUserId
        ? dataService.getPushSubscriptionsForUser(targetUserId)
        : dataService.getPushSubscriptions(),
    ignoreAlreadyNotified
      ? Promise.resolve({ notifications: [] })
      : dataService.getPremiumData(),
  ]);
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
  const lastNotificationsByReferenceId = groupLatestNotificationByReferenceId(
    premium.notifications,
  );
  const notifiedThisRun = new Set<string>();
  const pendingMatchIds = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let skippedAlreadyNotified = 0;
  let skippedNoPendingMatches = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;
  let userDataFailed = 0;

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const userPlayerId = userSubscriptions[0]?.playerId;
    const data = await dataService
      .getPlayerOfMatchData(userId, userPlayerId)
      .catch(() => {
        userDataFailed += 1;
        return null;
      });

    if (!data) {
      continue;
    }

    const pendingMatches = data.matches.filter(
      (match) =>
        !match.userVote &&
        match.players.length >= 2 &&
        match.votingStatus === "open" &&
        isMatchDateReached(match.date),
    );

    if (pendingMatches.length === 0) {
      skipped += 1;
      skippedNoPendingMatches += 1;
      continue;
    }

    for (const match of pendingMatches) {
      pendingMatchIds.add(match.id);
      const referenceId = `mvp:${userId}:${match.id}`;
      const lastNotification = lastNotificationsByReferenceId.get(referenceId);

      if (
        (!ignoreAlreadyNotified && isRecentMvpReminder(lastNotification)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        skippedAlreadyNotified += 1;
        continue;
      }

      const message = `Aún no votaste al MVP del partido vs ${match.rival}. Hacé clic y votá.`;
      let matchSent = 0;

      for (const subscription of userSubscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: "MVP listo para votar",
            body: message,
            tag: `mvp-${userId}-${match.id}`,
            url: "/player-of-match",
          });
          sent += 1;
          matchSent += 1;
        } catch (error) {
          failed += 1;
          await maybeDeactivateExpiredSubscription(
            dataService,
            subscription.endpoint,
            error,
          );
        }
      }

      if (matchSent > 0) {
        notifiedThisRun.add(referenceId);
        try {
          await dataService.createNotification({
            title: "MVP listo para votar",
            message,
            type: "info",
            targetRole: "player",
            targetUserId: userId,
            targetPlayerId: userPlayerId,
            referenceId,
            url: "/player-of-match",
          });
        } catch {
          notificationRecordsFailed += 1;
        }
      }
    }
  }

  await dataService
    .recordAuditEvent({
      actor,
      action: "notification.created",
      entityType: "notification",
      entityId: "player-of-match",
      summary: `${trigger} envio ${sent} push de MVP.`,
      metadata: {
        failed,
        ignoreAlreadyNotified,
        matches: pendingMatchIds.size,
        notificationRecordsFailed,
        sent,
        skipped,
        skippedAlreadyNotified,
        skippedNoPendingMatches,
        targetPlayerId: targetPlayerId ?? null,
        targetUserId: targetUserId ?? null,
        trigger,
        userDataFailed,
        users: subscriptionsByUser.size,
      },
    })
    .catch(() => undefined);

  return {
    failed,
    matches: pendingMatchIds.size,
    notificationRecordsFailed,
    sent,
    skipped,
    skippedAlreadyNotified,
    skippedNoPendingMatches,
    targetPlayerId,
    targetUserId,
    userDataFailed,
    users: subscriptionsByUser.size,
  };
}

export function expirePlayerOfMatchCache() {
  try {
    unstable_expireTag("google-sheets", "google-sheets:player-of-match");
  } catch {
    // Cache expiration is best-effort. Notification delivery should still run
    // in tests, scripts, or server contexts without a cache store.
  }
}

function isMatchDateReached(value: string) {
  if (!value) {
    return true;
  }

  const normalized = value.includes("T")
    ? value
    : value.includes(" ")
      ? value.replace(" ", "T")
      : `${value}T00:00:00-03:00`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

function groupSubscriptionsByUser(subscriptions: PushSubscriptionRecord[]) {
  return subscriptions.reduce((groups, subscription) => {
    const current = groups.get(subscription.userId) ?? [];

    current.push(subscription);
    groups.set(subscription.userId, current);

    return groups;
  }, new Map<string, PushSubscriptionRecord[]>());
}

function groupLatestNotificationByReferenceId(notifications: AppNotification[]) {
  const latestByReferenceId = new Map<string, AppNotification>();

  for (const notification of notifications) {
    if (!notification.referenceId) {
      continue;
    }

    const current = latestByReferenceId.get(notification.referenceId);

    if (
      !current ||
      getTimestamp(notification.createdAt) > getTimestamp(current.createdAt)
    ) {
      latestByReferenceId.set(notification.referenceId, notification);
    }
  }

  return latestByReferenceId;
}

function isRecentMvpReminder(notification?: AppNotification) {
  if (!notification) {
    return false;
  }

  const timestamp = getTimestamp(notification.createdAt);

  return timestamp > 0 && Date.now() - timestamp < MVP_REMINDER_INTERVAL_MS;
}

function getTimestamp(value: string) {
  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
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
