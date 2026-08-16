import "server-only";

import { unstable_expireTag } from "next/cache";

import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import type { AuthUser } from "@/types/auth";
import type { PlayerOfMatchMatch } from "@/types/player-of-match";
import type {
  AppNotification,
  AuditActor,
  PushSubscriptionRecord,
} from "@/types/premium";

const MVP_REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;

export interface PlayerOfMatchNotificationDetail {
  alreadyVotedMatchIds: string[];
  eligibleMatchIds: string[];
  failed: number;
  failedMatchIds: string[];
  matchIds: string[];
  missingNotificationMatchIds: string[];
  notifiedMatchIds: string[];
  pendingMatches: number;
  playerId?: string;
  recentNotificationMatchIds: string[];
  reasons: string[];
  sent: number;
  sentMatchIds: string[];
  skipped: number;
  skippedAlreadyNotifiedMatchIds: string[];
  subscriptionCount: number;
  userId: string;
  userName?: string;
}

export interface PlayerOfMatchNotificationReportItem {
  failed: number;
  matchIds: string[];
  notifiedMatchIds: string[];
  playerId?: string;
  reasons: string[];
  sent: number;
  subscriptionCount: number;
  userId: string;
  userName?: string;
}

export interface PlayerOfMatchNotificationReport {
  dataErrors: PlayerOfMatchNotificationReportItem[];
  notEligible: PlayerOfMatchNotificationReportItem[];
  notifiedNoPending: PlayerOfMatchNotificationReportItem[];
  pendingAlreadyNotified: PlayerOfMatchNotificationReportItem[];
  pendingNoActiveSubscription: PlayerOfMatchNotificationReportItem[];
  pendingPushFailed: PlayerOfMatchNotificationReportItem[];
  pendingSentNow: PlayerOfMatchNotificationReportItem[];
  pendingWithoutNotification: PlayerOfMatchNotificationReportItem[];
  votedWithNotification: PlayerOfMatchNotificationReportItem[];
  votedWithoutNotification: PlayerOfMatchNotificationReportItem[];
}

export interface SendOpenPlayerOfMatchNotificationsResult {
  details?: PlayerOfMatchNotificationDetail[];
  failed: number;
  matches: number;
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
  skippedAlreadyNotified: number;
  skippedNoPendingMatches: number;
  skippedNoSubscriptions: number;
  report?: PlayerOfMatchNotificationReport;
  targetPlayerId?: string;
  targetUserId?: string;
  userDataFailed: number;
  users: number;
}

export async function sendOpenPlayerOfMatchNotifications({
  actor,
  includeDetails = false,
  ignoreAlreadyNotified = false,
  targetPlayerId,
  targetUserId,
  trigger,
}: {
  actor: AuditActor;
  includeDetails?: boolean;
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
        : Promise.resolve([]),
    ignoreAlreadyNotified && !includeDetails
      ? Promise.resolve({ notifications: [] })
      : dataService.getPremiumData(),
  ]);
  const recipients = await buildNotificationRecipients({
    dataService,
    includeConfiguredUsers: includeDetails || (!targetPlayerId && !targetUserId),
    subscriptions,
    targetPlayerId,
    targetUserId,
  });
  const subscriptionUsers = countRecipientsWithSubscriptions(recipients);
  const lastNotificationsByReferenceId = groupLatestNotificationByReferenceId(
    premium.notifications,
  );
  const notifiedThisRun = new Set<string>();
  const pendingMatchIds = new Set<string>();
  const details: PlayerOfMatchNotificationDetail[] = [];
  let sent = 0;
  let skipped = 0;
  let skippedAlreadyNotified = 0;
  let skippedNoPendingMatches = 0;
  let skippedNoSubscriptions = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;
  let userDataFailed = 0;

  for (const recipient of recipients.values()) {
    const { userId, userSubscriptions } = recipient;
    const userPlayerId = recipient.playerId ?? userSubscriptions[0]?.playerId;
    const detail = createNotificationDetail(
      userId,
      userPlayerId,
      userSubscriptions,
      recipient.userName,
    );
    const data = await dataService
      .getPlayerOfMatchData(userId, userPlayerId)
      .catch(() => {
        userDataFailed += 1;
        detail.reasons.push("user-data-failed");
        return null;
      });

    if (!data) {
      details.push(detail);
      continue;
    }

    const eligibleMatches = data.matches.filter(isEligiblePlayerOfMatchReminderMatch);
    const alreadyVotedMatches = eligibleMatches.filter((match) => match.userVote);
    const pendingMatches = eligibleMatches.filter((match) => !match.userVote);
    const notifiedMatches = data.matches.filter((match) =>
      Boolean(
        findLatestMvpNotificationForMatch(
          premium.notifications,
          userId,
          userPlayerId,
          match,
        ),
      ),
    );
    const recentNotificationMatches = data.matches.filter((match) =>
      isRecentMvpReminder(
        findLatestMvpNotificationForMatch(
          premium.notifications,
          userId,
          userPlayerId,
          match,
        ),
      ),
    );

    detail.alreadyVotedMatchIds = alreadyVotedMatches.map((match) => match.id);
    detail.eligibleMatchIds = eligibleMatches.map((match) => match.id);
    detail.notifiedMatchIds = notifiedMatches.map((match) => match.id);
    detail.recentNotificationMatchIds = recentNotificationMatches.map(
      (match) => match.id,
    );
    detail.pendingMatches = pendingMatches.length;
    detail.matchIds = pendingMatches.map((match) => match.id);
    detail.missingNotificationMatchIds = eligibleMatches
      .filter((match) => !detail.notifiedMatchIds.includes(match.id))
      .map((match) => match.id);

    if (pendingMatches.length === 0) {
      skipped += 1;
      skippedNoPendingMatches += 1;
      detail.skipped += 1;
      detail.reasons.push(...getNoPendingMatchReasons(data.matches));
      details.push(detail);
      continue;
    }

    if (userSubscriptions.length === 0) {
      skipped += 1;
      skippedNoSubscriptions += 1;
      detail.skipped += 1;
      detail.reasons.push("no-active-subscription");
      details.push(detail);
      continue;
    }

    for (const match of pendingMatches) {
      pendingMatchIds.add(match.id);
      const referenceId = getMvpReferenceId(userId, match.id);
      const lastNotification =
        lastNotificationsByReferenceId.get(referenceId) ??
        findLatestMvpNotificationForMatch(
          premium.notifications,
          userId,
          userPlayerId,
          match,
        );

      if (
        (!ignoreAlreadyNotified && isRecentMvpReminder(lastNotification)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        skippedAlreadyNotified += 1;
        detail.skipped += 1;
        pushUniqueReason(detail, "already-notified");
        pushUniqueId(detail.skippedAlreadyNotifiedMatchIds, match.id);
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
          detail.sent += 1;
        } catch (error) {
          failed += 1;
          detail.failed += 1;
          pushUniqueId(detail.failedMatchIds, match.id);
          await maybeDeactivateExpiredSubscription(
            dataService,
            subscription.endpoint,
            error,
          );
        }
      }

      if (matchSent > 0) {
        notifiedThisRun.add(referenceId);
        pushUniqueId(detail.sentMatchIds, match.id);
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
          pushUniqueId(detail.notifiedMatchIds, match.id);
        } catch {
          notificationRecordsFailed += 1;
        }
      }
    }

    details.push(detail);
  }
  const report = includeDetails
    ? buildPlayerOfMatchNotificationReport(details)
    : undefined;

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
        includeDetails,
        matches: pendingMatchIds.size,
        notificationRecordsFailed,
        reportSummary: report
          ? JSON.stringify(summarizeNotificationReport(report))
          : null,
        sent,
        skipped,
        skippedAlreadyNotified,
        skippedNoPendingMatches,
        skippedNoSubscriptions,
        targetPlayerId: targetPlayerId ?? null,
        targetUserId: targetUserId ?? null,
        trigger,
        userDataFailed,
        users: subscriptionUsers,
      },
    })
    .catch(() => undefined);

  return {
    ...(includeDetails ? { details, report } : {}),
    failed,
    matches: pendingMatchIds.size,
    notificationRecordsFailed,
    sent,
    skipped,
    skippedAlreadyNotified,
    skippedNoPendingMatches,
    skippedNoSubscriptions,
    targetPlayerId,
    targetUserId,
    userDataFailed,
    users: subscriptionUsers,
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
    if (!subscription.playerId) {
      return groups;
    }

    const current = groups.get(subscription.userId) ?? [];

    current.push(subscription);
    groups.set(subscription.userId, current);

    return groups;
  }, new Map<string, PushSubscriptionRecord[]>());
}

async function buildNotificationRecipients({
  dataService,
  includeConfiguredUsers,
  subscriptions,
  targetPlayerId,
  targetUserId,
}: {
  dataService: ReturnType<typeof getDataService>;
  includeConfiguredUsers: boolean;
  subscriptions: PushSubscriptionRecord[];
  targetPlayerId?: string;
  targetUserId?: string;
}) {
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
  const recipients = new Map<
    string,
    {
      playerId?: string;
      userId: string;
      userName?: string;
      userSubscriptions: PushSubscriptionRecord[];
    }
  >();

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    recipients.set(userId, {
      playerId: userSubscriptions[0]?.playerId,
      userId,
      userSubscriptions,
    });
  }

  if (!includeConfiguredUsers) {
    return recipients;
  }

  const configuredPlayerUsers = getConfiguredPlayerUsers();

  if (configuredPlayerUsers.length === 0 && !targetPlayerId && !targetUserId) {
    const fallbackSubscriptions = await dataService
      .getPushSubscriptions()
      .catch(() => []);
    const fallbackSubscriptionsByUser = groupSubscriptionsByUser(fallbackSubscriptions);

    for (const [userId, userSubscriptions] of fallbackSubscriptionsByUser) {
      recipients.set(userId, {
        playerId: userSubscriptions[0]?.playerId,
        userId,
        userSubscriptions,
      });
    }

    return recipients;
  }

  await Promise.all(
    configuredPlayerUsers.map(async (user) => {
      if (targetUserId && user.id !== targetUserId) {
        return;
      }

      if (targetPlayerId && user.playerId !== targetPlayerId) {
        return;
      }

      const current = recipients.get(user.id);
      const playerSubscriptions = user.playerId
        ? await dataService.getPushSubscriptionsForPlayer(user.playerId).catch(() => [])
        : [];
      const userSubscriptions =
        playerSubscriptions.length > 0
          ? playerSubscriptions
          : await dataService.getPushSubscriptionsForUser(user.id).catch(() => []);

      recipients.set(user.id, {
        playerId: current?.playerId ?? user.playerId ?? userSubscriptions[0]?.playerId,
        userId: user.id,
        userName: user.name,
        userSubscriptions:
          current?.userSubscriptions && current.userSubscriptions.length > 0
            ? current.userSubscriptions
            : userSubscriptions,
      });
    }),
  );

  return recipients;
}

function countRecipientsWithSubscriptions(
  recipients: Map<string, { userSubscriptions: PushSubscriptionRecord[] }>,
) {
  return [...recipients.values()].filter(
    (recipient) => recipient.userSubscriptions.length > 0,
  ).length;
}

function getConfiguredPlayerUsers(): AuthUser[] {
  try {
    return getConfiguredAuthUsers().filter(
      (user) => user.role === "player" && Boolean(user.playerId),
    );
  } catch {
    return [];
  }
}

function createNotificationDetail(
  userId: string,
  playerId: string | undefined,
  subscriptions: PushSubscriptionRecord[],
  userName?: string,
): PlayerOfMatchNotificationDetail {
  return {
    alreadyVotedMatchIds: [],
    eligibleMatchIds: [],
    failed: 0,
    failedMatchIds: [],
    matchIds: [],
    missingNotificationMatchIds: [],
    notifiedMatchIds: [],
    pendingMatches: 0,
    playerId,
    recentNotificationMatchIds: [],
    reasons: [],
    sent: 0,
    sentMatchIds: [],
    skipped: 0,
    skippedAlreadyNotifiedMatchIds: [],
    subscriptionCount: subscriptions.length,
    userId,
    userName,
  };
}

function isEligiblePlayerOfMatchReminderMatch(match: PlayerOfMatchMatch) {
  return (
    match.players.length >= 2 &&
    match.votingStatus === "open" &&
    isMatchDateReached(match.date)
  );
}

function getNoPendingMatchReasons(matches: PlayerOfMatchMatch[]) {
  const reasons = new Set<string>();
  const eligibleMatches = matches.filter(isEligiblePlayerOfMatchReminderMatch);

  if (eligibleMatches.length > 0 && eligibleMatches.every((match) => match.userVote)) {
    reasons.add("already-voted");
  }

  if (matches.length === 0) {
    reasons.add("no-matches");
  }

  if (matches.some((match) => match.players.length < 2)) {
    reasons.add("not-enough-players");
  }

  if (matches.some((match) => match.votingStatus === "scheduled")) {
    reasons.add("voting-scheduled");
  }

  if (matches.some((match) => match.votingStatus === "closed")) {
    reasons.add("voting-closed");
  }

  if (
    matches.some(
      (match) => match.votingStatus === "open" && !isMatchDateReached(match.date),
    )
  ) {
    reasons.add("match-date-not-reached");
  }

  if (reasons.size === 0) {
    reasons.add("no-pending-matches");
  }

  return [...reasons];
}

function buildPlayerOfMatchNotificationReport(
  details: PlayerOfMatchNotificationDetail[],
): PlayerOfMatchNotificationReport {
  const report: PlayerOfMatchNotificationReport = {
    dataErrors: [],
    notEligible: [],
    notifiedNoPending: [],
    pendingAlreadyNotified: [],
    pendingNoActiveSubscription: [],
    pendingPushFailed: [],
    pendingSentNow: [],
    pendingWithoutNotification: [],
    votedWithNotification: [],
    votedWithoutNotification: [],
  };

  for (const detail of details) {
    if (detail.reasons.includes("user-data-failed")) {
      report.dataErrors.push(createReportItem(detail, []));
    }

    const votedWithNotification = detail.alreadyVotedMatchIds.filter((matchId) =>
      detail.notifiedMatchIds.includes(matchId),
    );
    const votedWithoutNotification = detail.alreadyVotedMatchIds.filter(
      (matchId) => !detail.notifiedMatchIds.includes(matchId),
    );

    if (votedWithNotification.length > 0) {
      report.votedWithNotification.push(createReportItem(detail, votedWithNotification));
    }

    if (votedWithoutNotification.length > 0) {
      report.votedWithoutNotification.push(
        createReportItem(detail, votedWithoutNotification),
      );
    }

    if (detail.matchIds.length > 0 && detail.subscriptionCount === 0) {
      report.pendingNoActiveSubscription.push(createReportItem(detail, detail.matchIds));
    }

    if (detail.failedMatchIds.length > 0) {
      report.pendingPushFailed.push(createReportItem(detail, detail.failedMatchIds));
    }

    if (detail.sentMatchIds.length > 0) {
      report.pendingSentNow.push(createReportItem(detail, detail.sentMatchIds));
    }

    if (detail.skippedAlreadyNotifiedMatchIds.length > 0) {
      report.pendingAlreadyNotified.push(
        createReportItem(detail, detail.skippedAlreadyNotifiedMatchIds),
      );
    }

    const pendingWithoutNotification = detail.matchIds.filter(
      (matchId) =>
        !detail.notifiedMatchIds.includes(matchId) &&
        !detail.sentMatchIds.includes(matchId) &&
        !detail.failedMatchIds.includes(matchId) &&
        detail.subscriptionCount > 0,
    );

    if (pendingWithoutNotification.length > 0) {
      report.pendingWithoutNotification.push(
        createReportItem(detail, pendingWithoutNotification),
      );
    }

    if (
      detail.eligibleMatchIds.length === 0 &&
      !detail.reasons.includes("user-data-failed")
    ) {
      if (detail.notifiedMatchIds.length > 0) {
        report.notifiedNoPending.push(createReportItem(detail, detail.notifiedMatchIds));
      } else {
        report.notEligible.push(createReportItem(detail, []));
      }
    }
  }

  return report;
}

function createReportItem(
  detail: PlayerOfMatchNotificationDetail,
  matchIds: string[],
): PlayerOfMatchNotificationReportItem {
  return {
    failed: detail.failed,
    matchIds,
    notifiedMatchIds: detail.notifiedMatchIds,
    playerId: detail.playerId,
    reasons: detail.reasons,
    sent: detail.sent,
    subscriptionCount: detail.subscriptionCount,
    userId: detail.userId,
    userName: detail.userName,
  };
}

function summarizeNotificationReport(report: PlayerOfMatchNotificationReport) {
  return Object.fromEntries(
    Object.entries(report).map(([key, rows]) => [key, rows.length]),
  );
}

function getMvpReferenceId(userId: string, matchId: string) {
  return `mvp:${userId}:${matchId}`;
}

function findLatestMvpNotificationForMatch(
  notifications: AppNotification[],
  userId: string,
  playerId: string | undefined,
  match: PlayerOfMatchMatch,
) {
  const candidates = notifications.filter((notification) =>
    isMvpNotificationForMatch(notification, userId, playerId, match),
  );

  return candidates.sort(
    (left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt),
  )[0];
}

function isMvpNotificationForMatch(
  notification: AppNotification,
  userId: string,
  playerId: string | undefined,
  match: PlayerOfMatchMatch,
) {
  if (notification.referenceId === getMvpReferenceId(userId, match.id)) {
    return true;
  }

  if (!isNotificationTargetedToPlayer(notification, userId, playerId)) {
    return false;
  }

  if (!isMvpNotification(notification)) {
    return false;
  }

  return doesNotificationReferenceMatch(notification, match);
}

function isNotificationTargetedToPlayer(
  notification: AppNotification,
  userId: string,
  playerId: string | undefined,
) {
  return (
    notification.targetUserId === userId ||
    notification.targetPlayerId === userId ||
    (Boolean(playerId) && notification.targetPlayerId === playerId)
  );
}

function isMvpNotification(notification: AppNotification) {
  const title = normalizeNotificationText(notification.title);

  return (
    title.includes("mvp") ||
    notification.url === "/player-of-match" ||
    notification.referenceId?.startsWith("mvp:") === true
  );
}

function doesNotificationReferenceMatch(
  notification: AppNotification,
  match: PlayerOfMatchMatch,
) {
  if (notification.referenceId?.includes(match.id)) {
    return true;
  }

  const message = normalizeNotificationText(notification.message);
  const rival = normalizeNotificationText(match.rival);

  return Boolean(rival && message.includes(rival));
}

function normalizeNotificationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function pushUniqueReason(detail: PlayerOfMatchNotificationDetail, reason: string) {
  if (!detail.reasons.includes(reason)) {
    detail.reasons.push(reason);
  }
}

function pushUniqueId(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
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
