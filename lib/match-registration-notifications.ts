import "server-only";

import { systemAuditActor } from "@/lib/audit";
import { APP_TEAM_NAME } from "@/lib/league-fixture";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
import type { LeagueFixtureMatch } from "@/types/fixture";
import type { AuditActor, PushSubscriptionRecord } from "@/types/premium";

export interface SendCoachMatchRegistrationNotificationResult {
  coaches: number;
  failed: number;
  matchId: string;
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
}

export async function sendCoachMatchRegistrationNotification({
  actor = systemAuditActor,
  ignoreAlreadyNotified = false,
  match,
}: {
  actor?: AuditActor;
  ignoreAlreadyNotified?: boolean;
  match: LeagueFixtureMatch;
}): Promise<SendCoachMatchRegistrationNotificationResult> {
  const dataService = getDataService();
  const [accountUsers, subscriptions, notifications] = await Promise.all([
    dataService.getAccountUsers().catch(() => [] as AccountUser[]),
    dataService.getPushSubscriptions().catch(() => [] as PushSubscriptionRecord[]),
    ignoreAlreadyNotified
      ? Promise.resolve([])
      : dataService.getNotifications().catch(() => []),
  ]);
  const coaches = accountUsers.filter((user) => user.role === "coach");
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
  const alreadyNotified = new Set(
    notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  const rival = getRivalName(match);
  const notification = {
    message: `Ya podés registrar los jugadores que participaron en el partido vs ${rival}.`,
    title: "Registrar jugadores",
    url: "/fixture",
  };
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;

  for (const coach of coaches) {
    const referenceId = getCoachMatchRegistrationReferenceId(coach.userId, match);
    const userSubscriptions = subscriptionsByUser.get(coach.userId) ?? [];

    if (
      (!ignoreAlreadyNotified && alreadyNotified.has(referenceId)) ||
      notifiedThisRun.has(referenceId)
    ) {
      skipped += 1;
      continue;
    }

    if (userSubscriptions.length === 0) {
      skipped += 1;
      continue;
    }

    let coachSent = 0;

    for (const subscription of userSubscriptions) {
      try {
        await sendPushNotification(subscription, {
          body: notification.message,
          tag: referenceId,
          title: notification.title,
          url: notification.url,
        });
        sent += 1;
        coachSent += 1;
      } catch (error) {
        failed += 1;
        await maybeDeactivateExpiredSubscription(
          dataService,
          subscription.endpoint,
          error,
        );
      }
    }

    if (coachSent > 0) {
      notifiedThisRun.add(referenceId);

      try {
        await dataService.createNotification({
          title: notification.title,
          message: notification.message,
          type: "info",
          targetRole: "coach",
          targetUserId: coach.userId,
          targetPlayerId: coach.playerId,
          referenceId,
          url: notification.url,
        });
      } catch {
        notificationRecordsFailed += 1;
      }
    }
  }

  await dataService
    .recordAuditEvent({
      actor,
      action: "notification.created",
      entityType: "notification",
      entityId: match.id,
      summary: `Se notifico al DT para registrar jugadores vs ${rival}.`,
      metadata: {
        coaches: coaches.length,
        failed,
        matchId: match.id,
        notificationRecordsFailed,
        sent,
        skipped,
      },
    })
    .catch(() => undefined);

  return {
    coaches: coaches.length,
    failed,
    matchId: match.id,
    notificationRecordsFailed,
    sent,
    skipped,
  };
}

function getRivalName(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function getCoachMatchRegistrationReferenceId(userId: string, match: LeagueFixtureMatch) {
  return `match-registration:${userId}:${match.id}`;
}

function groupSubscriptionsByUser(subscriptions: PushSubscriptionRecord[]) {
  return subscriptions.reduce((groups, subscription) => {
    const current = groups.get(subscription.userId) ?? [];

    if (!current.some((candidate) => candidate.endpoint === subscription.endpoint)) {
      current.push(subscription);
    }

    groups.set(subscription.userId, current);

    return groups;
  }, new Map<string, PushSubscriptionRecord[]>());
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
