import "server-only";

import { unstable_expireTag } from "next/cache";

import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import type { AccountUser } from "@/types/account";
import type { AuthRole, AuthUser } from "@/types/auth";
import type { PlayerOfMatchMatch } from "@/types/player-of-match";
import type {
  AppNotification,
  AuditActor,
  PushSubscriptionRecord,
} from "@/types/premium";

type PlayerOfMatchNotificationStage = "closing" | "midpoint" | "opening";
type PlayerOfMatchNotificationStageInput = PlayerOfMatchNotificationStage | "auto";

const CLOSING_REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const RECENT_NOTIFICATION_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

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
  role?: AuthRole;
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
  role?: AuthRole;
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
  notificationStage,
  targetPlayerId,
  targetUserId,
  trigger,
}: {
  actor: AuditActor;
  includeDetails?: boolean;
  ignoreAlreadyNotified?: boolean;
  notificationStage?: PlayerOfMatchNotificationStageInput;
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
    ignoreAlreadyNotified && !includeDetails
      ? Promise.resolve({ notifications: [] })
      : dataService.getPremiumData(),
  ]);
  const recipients = await buildNotificationRecipients({
    dataService,
    includeConfiguredUsers: true,
    subscriptions,
    targetPlayerId,
    targetUserId,
  });
  const globalData = await dataService
    .getPlayerOfMatchData("mvp-notification-system")
    .catch(() => null);
  const globalEligibleMatches =
    globalData?.matches.filter(isEligiblePlayerOfMatchReminderMatch) ?? [];
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
    const { role = "player", userId, userSubscriptions } = recipient;
    const userPlayerId = recipient.playerId ?? userSubscriptions[0]?.playerId;
    const detail = createNotificationDetail(
      userId,
      userPlayerId,
      userSubscriptions,
      recipient.userName,
      role,
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

    const notificationMatches = buildRecipientNotificationMatches(
      globalEligibleMatches,
      data.matches,
    );
    const eligibleMatches = notificationMatches.filter(
      isEligiblePlayerOfMatchReminderMatch,
    );
    const alreadyVotedMatches = eligibleMatches.filter((match) => match.userVote);
    const pendingMatches = eligibleMatches.filter((match) => !match.userVote);
    const notifiedMatches = notificationMatches.filter((match) =>
      Boolean(
        findLatestMvpNotificationForMatch(
          premium.notifications,
          userId,
          userPlayerId,
          match,
        ),
      ),
    );
    const recentNotificationMatches = notificationMatches.filter((match) =>
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
      detail.reasons.push(...getNoPendingMatchReasons(notificationMatches));
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
      const stage = resolveNotificationStage(match, trigger, notificationStage);

      if (!stage) {
        skipped += 1;
        detail.skipped += 1;
        pushUniqueReason(detail, "reminder-stage-not-due");
        continue;
      }

      pendingMatchIds.add(match.id);
      const referenceId = getMvpReferenceId(userId, match.id, stage);
      const lastNotification =
        lastNotificationsByReferenceId.get(referenceId) ??
        findLatestMvpNotificationForMatch(
          premium.notifications,
          userId,
          userPlayerId,
          match,
          stage,
        );

      if (
        (!ignoreAlreadyNotified && lastNotification) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        skippedAlreadyNotified += 1;
        detail.skipped += 1;
        pushUniqueReason(detail, "already-notified");
        pushUniqueId(detail.skippedAlreadyNotifiedMatchIds, match.id);
        continue;
      }

      const notification = buildMvpNotificationContent(match, stage);
      let matchSent = 0;

      for (const subscription of userSubscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: notification.title,
            body: notification.message,
            tag: `mvp-${stage}-${userId}-${match.id}`,
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
          await createMvpNotificationRecordWithRetry(() =>
            dataService.createNotification({
              title: notification.title,
              message: notification.message,
              type: "info",
              targetRole: role,
              targetUserId: userId,
              targetPlayerId: userPlayerId,
              referenceId,
              url: "/player-of-match",
            }),
          );
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
        notificationStage: notificationStage ?? null,
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

function buildRecipientNotificationMatches(
  globalEligibleMatches: PlayerOfMatchMatch[],
  userMatches: PlayerOfMatchMatch[],
) {
  if (globalEligibleMatches.length === 0) {
    return userMatches;
  }

  const userMatchesById = new Map(userMatches.map((match) => [match.id, match]));

  return globalEligibleMatches.map((globalMatch) => {
    const userMatch = userMatchesById.get(globalMatch.id);

    return {
      ...globalMatch,
      userVote: userMatch?.userVote,
    };
  });
}

async function createMvpNotificationRecordWithRetry(createRecord: () => Promise<void>) {
  const retryDelaysMs = [250, 750, 1500];
  let lastError: unknown;

  for (const delayMs of [0, ...retryDelaysMs]) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      await createRecord();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupSubscriptionsByUser(subscriptions: PushSubscriptionRecord[]) {
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
      role?: AuthRole;
      userId: string;
      userName?: string;
      userSubscriptions: PushSubscriptionRecord[];
    }
  >();

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    recipients.set(userId, {
      playerId: userSubscriptions[0]?.playerId,
      role: "player",
      userId,
      userSubscriptions,
    });
  }

  if (!includeConfiguredUsers) {
    return recipients;
  }

  const configuredUsers = await getConfiguredNotificationUsers(dataService);

  if (configuredUsers.length === 0 && !targetPlayerId && !targetUserId) {
    const fallbackSubscriptions = await dataService
      .getPushSubscriptions()
      .catch(() => []);
    const fallbackSubscriptionsByUser = groupSubscriptionsByUser(fallbackSubscriptions);

    for (const [userId, userSubscriptions] of fallbackSubscriptionsByUser) {
      recipients.set(userId, {
        playerId: userSubscriptions[0]?.playerId,
        role: "player",
        userId,
        userSubscriptions,
      });
    }

    return recipients;
  }

  await Promise.all(
    configuredUsers.map(async (user) => {
      if (targetUserId && user.id !== targetUserId) {
        return;
      }

      if (targetPlayerId && user.playerId !== targetPlayerId) {
        return;
      }

      const current = recipients.get(user.id);
      const primarySubscriptions =
        user.role === "coach"
          ? await dataService.getPushSubscriptionsForUser(user.id).catch(() => [])
          : user.playerId
            ? await dataService
                .getPushSubscriptionsForPlayer(user.playerId)
                .catch(() => [])
            : [];
      const fallbackSubscriptions =
        primarySubscriptions.length > 0
          ? primarySubscriptions
          : await dataService.getPushSubscriptionsForUser(user.id).catch(() => []);
      const userSubscriptions = mergeSubscriptions(
        current?.userSubscriptions ?? [],
        fallbackSubscriptions,
      );

      recipients.set(user.id, {
        playerId: current?.playerId ?? user.playerId ?? userSubscriptions[0]?.playerId,
        role: user.role,
        userId: user.id,
        userName: user.name,
        userSubscriptions,
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

async function getConfiguredNotificationUsers(
  dataService: ReturnType<typeof getDataService>,
): Promise<AuthUser[]> {
  const users = new Map<string, AuthUser>();

  try {
    for (const user of getConfiguredAuthUsers().filter(isMvpNotificationUser)) {
      users.set(user.id, user);
    }
  } catch {
    // Configured users are optional for notification fan-out.
  }

  const accountUsers = await dataService.getAccountUsers().catch(() => []);

  for (const account of accountUsers.filter(isMvpNotificationAccount)) {
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

function isMvpNotificationUser(user: AuthUser) {
  return user.role === "coach" || (user.role === "player" && Boolean(user.playerId));
}

function isMvpNotificationAccount(account: AccountUser) {
  return (
    account.role === "coach" || (account.role === "player" && Boolean(account.playerId))
  );
}

function mergeSubscriptions(
  left: PushSubscriptionRecord[],
  right: PushSubscriptionRecord[],
) {
  const subscriptions = [...left];

  for (const subscription of right) {
    if (
      !subscriptions.some((candidate) => candidate.endpoint === subscription.endpoint)
    ) {
      subscriptions.push(subscription);
    }
  }

  return subscriptions;
}

function createNotificationDetail(
  userId: string,
  playerId: string | undefined,
  subscriptions: PushSubscriptionRecord[],
  userName?: string,
  role?: AuthRole,
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
    role,
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

function resolveNotificationStage(
  match: PlayerOfMatchMatch,
  trigger: "cron" | "match-update" | "manual" | "webhook",
  requestedStage?: PlayerOfMatchNotificationStageInput,
): PlayerOfMatchNotificationStage | undefined {
  if (requestedStage && requestedStage !== "auto") {
    return isNotificationStageDue(match, requestedStage) ? requestedStage : undefined;
  }

  if (trigger === "webhook" || trigger === "match-update") {
    return "opening";
  }

  if (trigger === "manual" && requestedStage !== "auto") {
    return "opening";
  }

  return getAutomaticNotificationStage(match);
}

function getAutomaticNotificationStage(
  match: PlayerOfMatchMatch,
): PlayerOfMatchNotificationStage | undefined {
  if (isNotificationStageDue(match, "closing")) {
    return "closing";
  }

  if (isNotificationStageDue(match, "midpoint")) {
    return "midpoint";
  }

  if (isNotificationStageDue(match, "opening")) {
    return "opening";
  }

  return undefined;
}

function isNotificationStageDue(
  match: PlayerOfMatchMatch,
  stage: PlayerOfMatchNotificationStage,
) {
  const now = Date.now();
  const startsAt = getTimestamp(match.votingStartsAt);
  const endsAt = getTimestamp(match.votingEndsAt);

  if (
    match.votingStatus !== "open" ||
    startsAt <= 0 ||
    endsAt <= 0 ||
    now < startsAt ||
    now > endsAt
  ) {
    return false;
  }

  const closingStartsAt = endsAt - CLOSING_REMINDER_WINDOW_MS;
  const midpointAt = startsAt + (endsAt - startsAt) / 2;

  if (stage === "closing") {
    return now >= closingStartsAt;
  }

  if (stage === "midpoint") {
    return now >= midpointAt && now < closingStartsAt;
  }

  return now < midpointAt;
}

function buildMvpNotificationContent(
  match: PlayerOfMatchMatch,
  stage: PlayerOfMatchNotificationStage,
) {
  if (stage === "closing") {
    return {
      title: "Últimas 2 horas para votar",
      message: `En 2 horas cierra la votación del MVP vs ${match.rival}. Hacé clic y votá.`,
    };
  }

  if (stage === "midpoint") {
    return {
      title: "Aún no votaste al MVP",
      message: `Aún no votaste al MVP del partido vs ${match.rival}. Hacé clic y votá.`,
    };
  }

  return {
    title: "Ya podés votar al MVP",
    message: `Ya podés votar al MVP del partido vs ${match.rival}. Hacé clic y votá.`,
  };
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
    role: detail.role,
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

function getMvpReferenceId(
  userId: string,
  matchId: string,
  stage: PlayerOfMatchNotificationStage,
) {
  return `mvp:${stage}:${userId}:${matchId}`;
}

function getLegacyMvpReferenceId(userId: string, matchId: string) {
  return `mvp:${userId}:${matchId}`;
}

function findLatestMvpNotificationForMatch(
  notifications: AppNotification[],
  userId: string,
  playerId: string | undefined,
  match: PlayerOfMatchMatch,
  stage?: PlayerOfMatchNotificationStage,
) {
  const candidates = notifications.filter((notification) =>
    isMvpNotificationForMatch(notification, userId, playerId, match, stage),
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
  stage?: PlayerOfMatchNotificationStage,
) {
  if (stage && notification.referenceId === getMvpReferenceId(userId, match.id, stage)) {
    return true;
  }

  if (
    stage === "opening" &&
    notification.referenceId === getLegacyMvpReferenceId(userId, match.id)
  ) {
    return true;
  }

  if (stage) {
    return false;
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

function getTimestamp(value: string) {
  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isRecentMvpReminder(notification?: AppNotification) {
  if (!notification) {
    return false;
  }

  const timestamp = getTimestamp(notification.createdAt);

  return timestamp > 0 && Date.now() - timestamp < RECENT_NOTIFICATION_WINDOW_MS;
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
