import "server-only";

import { systemAuditActor } from "@/lib/audit";
import {
  APP_TEAM_NAME,
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import type { AccountUser } from "@/types/account";
import type { AuthRole, AuthUser } from "@/types/auth";
import type { LeagueFixtureMatch } from "@/types/fixture";
import type {
  AppNotification,
  AuditActor,
  PushSubscriptionRecord,
} from "@/types/premium";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const UPCOMING_MATCH_REMINDER_WINDOW_DAYS = [1, 2];

export interface SendUpcomingMatchReminderNotificationsResult {
  failed: number;
  matches: number;
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
  skippedNoSubscriptions: number;
  targetPlayerId?: string;
  targetDates: string[];
  users: number;
}

interface UpcomingMatchNotificationRecipient {
  playerId?: string;
  role: AuthRole;
  userId: string;
  userName?: string;
  userSubscriptions: PushSubscriptionRecord[];
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
  const [rawFixture, fixtureScheduleOverrides, subscriptions, notifications, users] =
    await Promise.all([
      getLeagueFixtureData(),
      dataService.getFixtureMatchScheduleOverrides().catch(() => []),
      dataService.getPushSubscriptions(),
      ignoreAlreadyNotified
        ? Promise.resolve({ notifications: [] })
        : dataService
            .getNotifications()
            .then((records) => ({ notifications: records }))
            .catch(() => ({ notifications: [] })),
      getConfiguredUpcomingMatchUsers(dataService),
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
  const playerRecipients = buildPlayerUpcomingMatchRecipients({
    subscriptions,
    targetPlayerId,
    users,
  });
  const coachRecipients = targetPlayerId
    ? new Map<string, UpcomingMatchNotificationRecipient>()
    : buildCoachUpcomingMatchRecipients({ subscriptions, users });
  const alreadyNotified = new Set(
    notifications.notifications
      .filter(isDeliveredNotificationRecord)
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const alreadyRecorded = new Set(
    notifications.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  const recordedThisRun = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let skippedNoSubscriptions = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;

  for (const match of matches) {
    const rival = getRivalName(match);
    const message = `Prepara los botines tu proximo partido es vs ${rival}`;
    const coachMessage = `Vamos con todo: el próximo rival es ${rival}.`;
    const matchLabel = formatUpcomingMatchLabel(match);

    for (const recipient of playerRecipients.values()) {
      const { playerId, userId, userName, userSubscriptions } = recipient;
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

      if (userSubscriptions.length === 0) {
        skipped += 1;
        skippedNoSubscriptions += 1;
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryStatus: "no_subscription",
          error: "Sin dispositivo push activo.",
          match,
          matchLabel,
          message,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId,
          recordedThisRun,
          referenceId,
          targetRole: "player",
          title: "Proximo partido",
          userId,
          userName,
        });
        continue;
      }

      let matchSent = 0;
      let lastError: unknown;

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
          lastError = error;
          await maybeDeactivateExpiredSubscription(
            dataService,
            subscription.endpoint,
            error,
          );
        }
      }

      if (matchSent > 0) {
        notifiedThisRun.add(referenceId);
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryAttempts: userSubscriptions.length,
          deliveryStatus: "sent",
          match,
          matchLabel,
          message,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId,
          recordedThisRun,
          referenceId,
          targetRole: "player",
          title: "Proximo partido",
          userId,
          userName,
        });
      } else {
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryAttempts: userSubscriptions.length,
          deliveryStatus: "failed",
          error: getDeliveryErrorMessage(lastError),
          match,
          matchLabel,
          message,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId,
          recordedThisRun,
          referenceId,
          targetRole: "player",
          title: "Proximo partido",
          userId,
          userName,
        });
      }
    }

    for (const coach of coachRecipients.values()) {
      const { userSubscriptions } = coach;
      const referenceId = getCoachUpcomingMatchReferenceId(coach.userId, match);

      if (
        (!ignoreAlreadyNotified && alreadyNotified.has(referenceId)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        continue;
      }

      if (userSubscriptions.length === 0) {
        skipped += 1;
        skippedNoSubscriptions += 1;
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryStatus: "no_subscription",
          error: "Sin dispositivo push activo.",
          match,
          matchLabel,
          message: coachMessage,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId: coach.playerId,
          recordedThisRun,
          referenceId,
          targetRole: "coach",
          title: "Próximo partido",
          userId: coach.userId,
          userName: coach.userName,
        });
        continue;
      }

      let matchSent = 0;
      let lastError: unknown;

      for (const subscription of userSubscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: "Próximo partido",
            body: coachMessage,
            tag: referenceId,
            url: "/fixture",
          });
          sent += 1;
          matchSent += 1;
        } catch (error) {
          failed += 1;
          lastError = error;
          await maybeDeactivateExpiredSubscription(
            dataService,
            subscription.endpoint,
            error,
          );
        }
      }

      if (matchSent > 0) {
        notifiedThisRun.add(referenceId);
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryAttempts: userSubscriptions.length,
          deliveryStatus: "sent",
          match,
          matchLabel,
          message: coachMessage,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId: coach.playerId,
          recordedThisRun,
          referenceId,
          targetRole: "coach",
          title: "Próximo partido",
          userId: coach.userId,
          userName: coach.userName,
        });
      } else {
        await createUpcomingMatchDeliveryRecord({
          alreadyRecorded,
          dataService,
          deliveryAttempts: userSubscriptions.length,
          deliveryStatus: "failed",
          error: getDeliveryErrorMessage(lastError),
          match,
          matchLabel,
          message: coachMessage,
          notificationRecordsFailed: () => {
            notificationRecordsFailed += 1;
          },
          playerId: coach.playerId,
          recordedThisRun,
          referenceId,
          targetRole: "coach",
          title: "Próximo partido",
          userId: coach.userId,
          userName: coach.userName,
        });
      }
    }
  }

  const usersWithSubscriptions =
    countRecipientsWithSubscriptions(playerRecipients) +
    countRecipientsWithSubscriptions(coachRecipients);

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
        coaches: coachRecipients.size,
        failed,
        matches: matches.length,
        notificationRecordsFailed,
        sent,
        skipped,
        skippedNoSubscriptions,
        targetDates: targetDates.join(","),
        targetPlayerId: targetPlayerId ?? null,
        users: usersWithSubscriptions,
      },
    })
    .catch(() => undefined);

  return {
    failed,
    matches: matches.length,
    notificationRecordsFailed,
    sent,
    skipped,
    skippedNoSubscriptions,
    targetPlayerId,
    targetDates,
    users: usersWithSubscriptions,
  };
}

function getRivalName(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function buildPlayerUpcomingMatchRecipients({
  subscriptions,
  targetPlayerId,
  users,
}: {
  subscriptions: PushSubscriptionRecord[];
  targetPlayerId?: string;
  users: AuthUser[];
}) {
  const coachUserIds = new Set(
    users.filter((user) => user.role === "coach").map((user) => user.id),
  );
  const playerUsers = users.filter(
    (user) =>
      user.role === "player" &&
      Boolean(user.playerId) &&
      (!targetPlayerId || user.playerId === targetPlayerId),
  );
  const playerSubscriptions = subscriptions.filter(
    (subscription) =>
      Boolean(subscription.playerId) &&
      !coachUserIds.has(subscription.userId) &&
      (!targetPlayerId || subscription.playerId === targetPlayerId),
  );
  const subscriptionsByUser = groupSubscriptionsByUser(playerSubscriptions);
  const subscriptionsByPlayer = groupSubscriptionsByPlayer(playerSubscriptions);
  const recipients = new Map<string, UpcomingMatchNotificationRecipient>();

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const playerId = userSubscriptions[0]?.playerId;

    recipients.set(userId, {
      playerId,
      role: "player",
      userId,
      userSubscriptions,
    });
  }

  for (const user of playerUsers) {
    const userSubscriptions = mergeSubscriptions(
      recipients.get(user.id)?.userSubscriptions ?? [],
      subscriptionsByUser.get(user.id) ?? [],
      user.playerId ? (subscriptionsByPlayer.get(user.playerId) ?? []) : [],
    );

    recipients.set(user.id, {
      playerId: user.playerId,
      role: "player",
      userId: user.id,
      userName: user.name,
      userSubscriptions,
    });
  }

  return recipients;
}

function buildCoachUpcomingMatchRecipients({
  subscriptions,
  users,
}: {
  subscriptions: PushSubscriptionRecord[];
  users: AuthUser[];
}) {
  const coachUsers = users.filter((user) => user.role === "coach");
  const coachUserIds = new Set(coachUsers.map((coach) => coach.id));
  const subscriptionsByUser = groupSubscriptionsByUser(
    subscriptions.filter((subscription) => coachUserIds.has(subscription.userId)),
  );
  const recipients = new Map<string, UpcomingMatchNotificationRecipient>();

  for (const coach of coachUsers) {
    recipients.set(coach.id, {
      playerId: coach.playerId,
      role: "coach",
      userId: coach.id,
      userName: coach.name,
      userSubscriptions: subscriptionsByUser.get(coach.id) ?? [],
    });
  }

  return recipients;
}

function groupSubscriptionsByPlayer(subscriptions: PushSubscriptionRecord[]) {
  return subscriptions.reduce((groups, subscription) => {
    if (!subscription.playerId) {
      return groups;
    }

    const current = groups.get(subscription.playerId) ?? [];

    if (!current.some((candidate) => candidate.endpoint === subscription.endpoint)) {
      current.push(subscription);
    }

    groups.set(subscription.playerId, current);

    return groups;
  }, new Map<string, PushSubscriptionRecord[]>());
}

function mergeSubscriptions(...groups: PushSubscriptionRecord[][]) {
  const subscriptions: PushSubscriptionRecord[] = [];

  for (const group of groups) {
    for (const subscription of group) {
      if (
        !subscriptions.some((candidate) => candidate.endpoint === subscription.endpoint)
      ) {
        subscriptions.push(subscription);
      }
    }
  }

  return subscriptions;
}

function countRecipientsWithSubscriptions(
  recipients: Map<string, UpcomingMatchNotificationRecipient>,
) {
  return [...recipients.values()].filter(
    (recipient) => recipient.userSubscriptions.length > 0,
  ).length;
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
function getUpcomingMatchReferenceId(userId: string, match: LeagueFixtureMatch) {
  const dateKey = match.dateIso || match.roundDate || "sin-fecha";
  const rivalKey = normalizeReferenceSegment(getRivalName(match));
  const competitionKey = normalizeReferenceSegment(match.competitionKind);

  return `upcoming-match:${userId}:${dateKey}:${competitionKey}:${rivalKey}`;
}

function getLegacyUpcomingMatchReferenceId(userId: string, match: LeagueFixtureMatch) {
  return `upcoming-match:${userId}:${match.id}`;
}

function getCoachUpcomingMatchReferenceId(userId: string, match: LeagueFixtureMatch) {
  const dateKey = match.dateIso || match.roundDate || "sin-fecha";
  const rivalKey = normalizeReferenceSegment(getRivalName(match));
  const competitionKey = normalizeReferenceSegment(match.competitionKind);

  return `upcoming-match-coach:${userId}:${dateKey}:${competitionKey}:${rivalKey}`;
}

function isAlreadyNotified(
  alreadyNotified: Set<string>,
  referenceId: string,
  legacyReferenceId: string,
) {
  return alreadyNotified.has(referenceId) || alreadyNotified.has(legacyReferenceId);
}

async function createUpcomingMatchDeliveryRecord({
  alreadyRecorded,
  dataService,
  deliveryAttempts = 0,
  deliveryStatus,
  error,
  match,
  matchLabel,
  message,
  notificationRecordsFailed,
  playerId,
  recordedThisRun,
  referenceId,
  targetRole,
  title,
  userId,
  userName,
}: {
  alreadyRecorded: Set<string>;
  dataService: ReturnType<typeof getDataService>;
  deliveryAttempts?: number;
  deliveryStatus: "failed" | "no_subscription" | "sent";
  error?: string;
  match: LeagueFixtureMatch;
  matchLabel: string;
  message: string;
  notificationRecordsFailed: () => void;
  playerId?: string;
  recordedThisRun: Set<string>;
  referenceId: string;
  targetRole: AuthRole;
  title: string;
  userId: string;
  userName?: string;
}) {
  const shouldNotifyRecipient = deliveryStatus === "sent";

  if (recordedThisRun.has(referenceId)) {
    return;
  }

  if (alreadyRecorded.has(referenceId) && deliveryStatus !== "sent") {
    return;
  }

  try {
    await dataService.createNotification({
      title,
      message,
      type:
        deliveryStatus === "failed"
          ? "danger"
          : deliveryStatus === "no_subscription"
            ? "warning"
            : "info",
      status: shouldNotifyRecipient ? "unread" : "archived",
      targetRole: shouldNotifyRecipient ? targetRole : "admin",
      targetUserId: shouldNotifyRecipient ? userId : undefined,
      targetPlayerId: shouldNotifyRecipient ? playerId : undefined,
      referenceId,
      url: "/fixture",
      deliveryAttempts,
      deliveryError: error,
      deliveryStatus,
      matchId: match.id,
      matchLabel,
      notificationKind: "upcoming-match",
      recipientName: userName,
      recipientPlayerId: playerId,
      recipientUserId: userId,
    });
    alreadyRecorded.add(referenceId);
    recordedThisRun.add(referenceId);
  } catch {
    notificationRecordsFailed();
  }
}

function isDeliveredNotificationRecord(notification: AppNotification) {
  return (
    notification.deliveryStatus === "created" || notification.deliveryStatus === "sent"
  );
}

function formatUpcomingMatchLabel(match: LeagueFixtureMatch) {
  const date = match.dateIso || match.roundDate || "Fecha a definir";
  const competition = match.competitionKind.toUpperCase();

  return `${date} · ${competition} · vs ${getRivalName(match)}`;
}

function getDeliveryErrorMessage(error: unknown) {
  if (!error) {
    return "No se pudo enviar a ningun dispositivo.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo enviar a ningun dispositivo.";
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

async function getConfiguredUpcomingMatchUsers(
  dataService: ReturnType<typeof getDataService>,
) {
  const users = new Map<string, AuthUser>();

  try {
    for (const user of getConfiguredAuthUsers().filter(isUpcomingMatchAccountUser)) {
      users.set(user.id, user);
    }
  } catch {
    // Configured users are optional for notification fan-out.
  }

  const accountUsers = await dataService.getAccountUsers().catch(() => []);

  for (const account of accountUsers.filter(isUpcomingMatchAccount)) {
    users.set(account.userId, {
      id: account.userId,
      name: account.name,
      playerId: account.playerId,
      role: account.role,
      username: account.username,
    });
  }

  return [...users.values()];
}

function isUpcomingMatchAccountUser(user: AuthUser) {
  return user.role === "coach" || (user.role === "player" && Boolean(user.playerId));
}

function isUpcomingMatchAccount(account: AccountUser) {
  return (
    account.role === "coach" || (account.role === "player" && Boolean(account.playerId))
  );
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
