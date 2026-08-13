import "server-only";

import { systemAuditActor } from "@/lib/audit";
import {
  APP_TEAM_NAME,
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { LeagueFixtureMatch } from "@/types/fixture";
import type { AuditActor, PushSubscriptionRecord } from "@/types/premium";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const UPCOMING_MATCH_REMINDER_WINDOW_DAYS = [1, 2];

export interface SendUpcomingMatchReminderNotificationsResult {
  failed: number;
  matches: number;
  sent: number;
  skipped: number;
  targetDates: string[];
  users: number;
}

export async function sendUpcomingMatchReminderNotifications({
  actor = systemAuditActor,
  now = new Date(),
}: {
  actor?: AuditActor;
  now?: Date;
} = {}): Promise<SendUpcomingMatchReminderNotificationsResult> {
  const dataService = getDataService();
  const targetDates = UPCOMING_MATCH_REMINDER_WINDOW_DAYS.map((days) =>
    addDaysToDateIso(getArgentinaDateIso(now), days),
  );
  const targetDateSet = new Set(targetDates);
  const [rawFixture, fixtureScheduleOverrides, subscriptions, premium] =
    await Promise.all([
      getLeagueFixtureData(),
      dataService.getFixtureMatchScheduleOverrides().catch(() => []),
      dataService.getPushSubscriptions(),
      dataService.getPremiumData(),
    ]);
  const fixture = applyLeagueFixtureScheduleOverrides(
    rawFixture,
    fixtureScheduleOverrides,
  );
  const matches = fixture.nextMatches.filter(
    (match) =>
      match.status === "pending" &&
      !match.involvesBye &&
      targetDateSet.has(match.dateIso),
  );
  const subscriptionsByUser = groupPlayerSubscriptionsByUser(subscriptions);
  const alreadyNotified = new Set(
    premium.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    const rival = getRivalName(match);
    const message = `Prepara los botines tu proximo partido es vs ${rival}`;

    for (const [userId, userSubscriptions] of subscriptionsByUser) {
      const playerId = userSubscriptions[0]?.playerId;
      const referenceId = `upcoming-match:${userId}:${match.id}`;

      if (alreadyNotified.has(referenceId) || notifiedThisRun.has(referenceId)) {
        skipped += 1;
        continue;
      }

      let matchSent = 0;

      for (const subscription of userSubscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: "Proximo partido",
            body: message,
            tag: `upcoming-match-${userId}-${match.id}`,
            url: "/fixture",
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
        await dataService.createNotification({
          title: "Proximo partido",
          message,
          type: "info",
          targetRole: "player",
          targetUserId: userId,
          targetPlayerId: playerId,
          referenceId,
          url: "/fixture",
        });
      }
    }
  }

  await dataService.recordAuditEvent({
    actor,
    action: "notification.created",
    entityType: "notification",
    entityId: targetDates.join(","),
    summary: `Cron envio ${sent} push de proximo partido para ${targetDates.join(
      " o ",
    )}.`,
    metadata: {
      failed,
      matches: matches.length,
      sent,
      skipped,
      targetDates,
      users: subscriptionsByUser.size,
    },
  });

  return {
    failed,
    matches: matches.length,
    sent,
    skipped,
    targetDates,
    users: subscriptionsByUser.size,
  };
}

function getRivalName(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function groupPlayerSubscriptionsByUser(subscriptions: PushSubscriptionRecord[]) {
  return subscriptions.reduce((groups, subscription) => {
    if (!subscription.playerId) {
      return groups;
    }

    const current = groups.get(subscription.userId) ?? [];

    current.push(subscription);
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

function getArgentinaDateIso(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function addDaysToDateIso(dateIso: string, days: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));

  return date.toISOString().slice(0, 10);
}
