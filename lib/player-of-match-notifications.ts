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
  matchIds: string[];
  pendingMatches: number;
  playerId?: string;
  reasons: string[];
  sent: number;
  skipped: number;
  subscriptionCount: number;
  userId: string;
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
        : dataService.getPushSubscriptions(),
    ignoreAlreadyNotified
      ? Promise.resolve({ notifications: [] })
      : dataService.getPremiumData(),
  ]);
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
  const recipients = buildNotificationRecipients({
    includeConfiguredUsers: includeDetails,
    subscriptionsByUser,
    targetPlayerId,
    targetUserId,
  });
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
    const detail = createNotificationDetail(userId, userPlayerId, userSubscriptions);
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

    detail.alreadyVotedMatchIds = alreadyVotedMatches.map((match) => match.id);
    detail.eligibleMatchIds = eligibleMatches.map((match) => match.id);
    detail.pendingMatches = pendingMatches.length;
    detail.matchIds = pendingMatches.map((match) => match.id);

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
      const referenceId = `mvp:${userId}:${match.id}`;
      const lastNotification = lastNotificationsByReferenceId.get(referenceId);

      if (
        (!ignoreAlreadyNotified && isRecentMvpReminder(lastNotification)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        skippedAlreadyNotified += 1;
        detail.skipped += 1;
        pushUniqueReason(detail, "already-notified");
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

    details.push(detail);
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
        includeDetails,
        matches: pendingMatchIds.size,
        notificationRecordsFailed,
        sent,
        skipped,
        skippedAlreadyNotified,
        skippedNoPendingMatches,
        skippedNoSubscriptions,
        targetPlayerId: targetPlayerId ?? null,
        targetUserId: targetUserId ?? null,
        trigger,
        userDataFailed,
        users: subscriptionsByUser.size,
      },
    })
    .catch(() => undefined);

  return {
    ...(includeDetails ? { details } : {}),
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

function buildNotificationRecipients({
  includeConfiguredUsers,
  subscriptionsByUser,
  targetPlayerId,
  targetUserId,
}: {
  includeConfiguredUsers: boolean;
  subscriptionsByUser: Map<string, PushSubscriptionRecord[]>;
  targetPlayerId?: string;
  targetUserId?: string;
}) {
  const recipients = new Map<
    string,
    {
      playerId?: string;
      userId: string;
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

  for (const user of getConfiguredPlayerUsers()) {
    if (targetUserId && user.id !== targetUserId) {
      continue;
    }

    if (targetPlayerId && user.playerId !== targetPlayerId) {
      continue;
    }

    const current = recipients.get(user.id);

    recipients.set(user.id, {
      playerId: current?.playerId ?? user.playerId,
      userId: user.id,
      userSubscriptions: current?.userSubscriptions ?? [],
    });
  }

  return recipients;
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
): PlayerOfMatchNotificationDetail {
  return {
    alreadyVotedMatchIds: [],
    eligibleMatchIds: [],
    failed: 0,
    matchIds: [],
    pendingMatches: 0,
    playerId,
    reasons: [],
    sent: 0,
    skipped: 0,
    subscriptionCount: subscriptions.length,
    userId,
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

function pushUniqueReason(detail: PlayerOfMatchNotificationDetail, reason: string) {
  if (!detail.reasons.includes(reason)) {
    detail.reasons.push(reason);
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
