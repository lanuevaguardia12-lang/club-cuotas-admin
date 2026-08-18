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
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
  targetPlayerId?: string;
  targetDates: string[];
  users: number;
}

export async function sendUpcomingMatchReminderNotifications({
  actor = systemAuditActor,
  forceNextMatch = false,
  ignoreAlreadyNotified = false,
  now = new Date(),
  targetPlayerId,
}: {
  actor?: AuditActor;
  forceNextMatch?: boolean;
  ignoreAlreadyNotified?: boolean;
  now?: Date;
  targetPlayerId?: string;
} = {}): Promise<SendUpcomingMatchReminderNotificationsResult> {
  const dataService = getDataService();
  const targetDates = UPCOMING_MATCH_REMINDER_WINDOW_DAYS.map((days) =>
    addDaysToDateIso(getArgentinaDateIso(now), days),
  );
  const targetDateSet = new Set(targetDates);
  const [rawFixture, fixtureScheduleOverrides, subscriptions, notifications] =
    await Promise.all([
      getLeagueFixtureData(),
      dataService.getFixtureMatchScheduleOverrides().catch(() => []),
      targetPlayerId
        ? dataService.getPushSubscriptionsForPlayer(targetPlayerId)
        : dataService.getPushSubscriptions(),
      ignoreAlreadyNotified
        ? Promise.resolve({ notifications: [] })
        : dataService
            .getNotifications()
            .then((records) => ({ notifications: records }))
            .catch(() => ({ notifications: [] })),
    ]);
  const fixture = applyLeagueFixtureScheduleOverrides(
    rawFixture,
    fixtureScheduleOverrides,
  );
  const candidateMatches = fixture.nextMatches.filter(
    (match) =>
      match.status === "pending" &&
      !match.involvesBye &&
      (forceNextMatch ||
        (typeof match.dateIso === "string" && targetDateSet.has(match.dateIso))),
  );
  const matches = forceNextMatch ? candidateMatches.slice(0, 1) : candidateMatches;
  const subscriptionsByUser = groupPlayerSubscriptionsByUser(subscriptions);
  const alreadyNotified = new Set(
    notifications.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;

  for (const match of matches) {
    const rival = getRivalName(match);
    const message = `Prepara los botines tu proximo partido es vs ${rival}`;

    for (const [userId, userSubscriptions] of subscriptionsByUser) {
      const playerId = userSubscriptions[0]?.playerId;
      const referenceId = getUpcomingMatchReferenceId(userId, match);
      const legacyReferenceId = getLegacyUpcomingMatchReferenceId(userId, match);

      if (
        (!ignoreAlreadyNotified &&
          isAlreadyNotified(alreadyNotified, referenceId, legacyReferenceId)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        continue;
      }

      let matchSent = 0;

      for (const subscription of userSubscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: "Proximo partido",
            body: message,
            tag: referenceId,
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
        try {
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
      entityId: targetDates.join(","),
      summary: `Cron envio ${sent} push de proximo partido para ${targetDates.join(
        " o ",
      )}.`,
      metadata: {
        failed,
        matches: matches.length,
        notificationRecordsFailed,
        sent,
        skipped,
        targetDates: targetDates.join(","),
        targetPlayerId: targetPlayerId ?? null,
        users: subscriptionsByUser.size,
      },
    })
    .catch(() => undefined);

  return {
    failed,
    matches: matches.length,
    notificationRecordsFailed,
    sent,
    skipped,
    targetPlayerId,
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

    if (!current.some((candidate) => candidate.endpoint === subscription.endpoint)) {
      current.push(subscription);
    }

    groups.set(subscription.userId, current);

    return groups;
  }, new Map<string, PushSubscriptionRecord[]>());
}

function getUpcomingMatchReferenceId(userId: string, match: LeagueFixtureMatch) {
  const dateKey = match.dateIso || match.roundDate || "sin-fecha";
  const rivalKey = normalizeReferenceSegment(getRivalName(match));
  const competitionKey = normalizeReferenceSegment(match.competitionKind);

  return `upcoming-match:${userId}:${dateKey}:${competitionKey}:${rivalKey}`;
}

function getLegacyUpcomingMatchReferenceId(userId: string, match: LeagueFixtureMatch) {
  return `upcoming-match:${userId}:${match.id}`;
}

function isAlreadyNotified(
  alreadyNotified: Set<string>,
  referenceId: string,
  legacyReferenceId: string,
) {
  return alreadyNotified.has(referenceId) || alreadyNotified.has(legacyReferenceId);
}

function normalizeReferenceSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
