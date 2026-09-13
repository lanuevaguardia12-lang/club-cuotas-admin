import "server-only";

import { systemAuditActor } from "@/lib/audit";
import {
  APP_TEAM_NAME,
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import {
  buildMatchRegistrationStatusByMatchKey,
  getMatchRegistrationStatusKeyForFixture,
} from "@/lib/match-registration-form";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
import type { IDataService } from "@/services/IDataService";
import type { LeagueFixtureData, LeagueFixtureMatch } from "@/types/fixture";
import type {
  AppNotification,
  AuditActor,
  NotificationDeliveryStatus,
  PushSubscriptionRecord,
} from "@/types/premium";

export interface SendCoachMatchRegistrationNotificationResult {
  coaches: number;
  failed: number;
  matchId: string;
  matchLabel: string;
  notificationRecordsFailed: number;
  reason?: "already-registered" | "no-played-match" | "registration-status-error";
  registered: boolean;
  sent: number;
  skipped: number;
  skippedAlreadyNotified: number;
  skippedNoSubscriptions: number;
}

interface SendCoachMatchRegistrationNotificationInput {
  actor?: AuditActor;
  ignoreAlreadyNotified?: boolean;
  match: LeagueFixtureMatch;
  notificationDate?: string;
}

export async function sendLatestCoachMatchRegistrationReminder({
  actor = systemAuditActor,
  ignoreAlreadyNotified = false,
}: {
  actor?: AuditActor;
  ignoreAlreadyNotified?: boolean;
} = {}): Promise<SendCoachMatchRegistrationNotificationResult> {
  const dataService = getDataService();
  const fixture = await getFixtureDataWithOverrides(dataService);
  const match = findLatestPlayedClubMatch(fixture);

  if (!match) {
    await recordMatchRegistrationCronAudit({
      actor,
      matchId: "",
      matchLabel: "",
      reason: "no-played-match",
      registered: false,
    });

    return buildEmptyResult({
      matchId: "",
      matchLabel: "",
      reason: "no-played-match",
      registered: false,
    });
  }

  const registrationStatus = await getFixtureMatchRegistrationStatus(dataService, match);
  const matchLabel = formatMatchLabel(match);

  if (registrationStatus === "error") {
    await recordMatchRegistrationCronAudit({
      actor,
      matchId: match.id,
      matchLabel,
      reason: "registration-status-error",
      registered: false,
    });

    return buildEmptyResult({
      matchId: match.id,
      matchLabel,
      reason: "registration-status-error",
      registered: false,
    });
  }

  if (registrationStatus === "registered") {
    await recordMatchRegistrationCronAudit({
      actor,
      matchId: match.id,
      matchLabel,
      reason: "already-registered",
      registered: true,
    });

    return buildEmptyResult({
      matchId: match.id,
      matchLabel,
      reason: "already-registered",
      registered: true,
    });
  }

  return sendCoachMatchRegistrationNotification({
    actor,
    ignoreAlreadyNotified,
    match,
    notificationDate: getArgentinaDateKey(),
  });
}

export async function sendCoachMatchRegistrationNotification({
  actor = systemAuditActor,
  ignoreAlreadyNotified = false,
  match,
  notificationDate,
}: SendCoachMatchRegistrationNotificationInput): Promise<SendCoachMatchRegistrationNotificationResult> {
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
  const alreadyRecorded = new Set(
    notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  const rival = getRivalName(match);
  const matchLabel = formatMatchLabel(match);
  const notification = {
    message: `Che, tenés que cargar los jugadores que ingresaron en el partido vs ${rival}.`,
    title: "Cargar jugadores",
    url: "/fixture",
  };
  let sent = 0;
  let skipped = 0;
  let skippedAlreadyNotified = 0;
  let skippedNoSubscriptions = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;

  for (const coach of coaches) {
    const referenceId = getCoachMatchRegistrationReferenceId(
      coach.userId,
      match,
      notificationDate,
    );
    const userSubscriptions = subscriptionsByUser.get(coach.userId) ?? [];

    if (
      (!ignoreAlreadyNotified &&
        hasAlreadyNotifiedCoachForMatchOnDate({
          match,
          notificationDate,
          notifications,
          referenceId,
          userId: coach.userId,
        })) ||
      notifiedThisRun.has(referenceId)
    ) {
      skipped += 1;
      skippedAlreadyNotified += 1;
      continue;
    }

    if (userSubscriptions.length === 0) {
      skipped += 1;
      skippedNoSubscriptions += 1;
      await createCoachMatchRegistrationDeliveryRecord({
        alreadyRecorded,
        coach,
        dataService,
        deliveryStatus: "no_subscription",
        match,
        matchLabel,
        message: notification.message,
        notificationRecordsFailed: () => {
          notificationRecordsFailed += 1;
        },
        recordedThisRun: notifiedThisRun,
        referenceId,
        title: notification.title,
      });
      continue;
    }

    let coachSent = 0;
    let lastError = "";

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
        lastError = getErrorMessage(error);
        await maybeDeactivateExpiredSubscription(
          dataService,
          subscription.endpoint,
          error,
        );
      }
    }

    if (coachSent > 0) {
      await createCoachMatchRegistrationDeliveryRecord({
        alreadyRecorded,
        coach,
        dataService,
        deliveryAttempts: userSubscriptions.length,
        deliveryStatus: "sent",
        match,
        matchLabel,
        message: notification.message,
        notificationRecordsFailed: () => {
          notificationRecordsFailed += 1;
        },
        recordedThisRun: notifiedThisRun,
        referenceId,
        title: notification.title,
      });
    } else {
      await createCoachMatchRegistrationDeliveryRecord({
        alreadyRecorded,
        coach,
        dataService,
        deliveryAttempts: userSubscriptions.length,
        deliveryStatus: "failed",
        error: lastError || "No se pudo enviar el push al DT.",
        match,
        matchLabel,
        message: notification.message,
        notificationRecordsFailed: () => {
          notificationRecordsFailed += 1;
        },
        recordedThisRun: notifiedThisRun,
        referenceId,
        title: notification.title,
      });
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
        matchLabel,
        notificationRecordsFailed,
        registered: false,
        sent,
        skipped,
        skippedAlreadyNotified,
        skippedNoSubscriptions,
      },
    })
    .catch(() => undefined);

  return {
    coaches: coaches.length,
    failed,
    matchId: match.id,
    matchLabel,
    notificationRecordsFailed,
    registered: false,
    sent,
    skipped,
    skippedAlreadyNotified,
    skippedNoSubscriptions,
  };
}

async function getFixtureDataWithOverrides(dataService: IDataService) {
  const [fixture, overrides] = await Promise.all([
    getLeagueFixtureData(),
    dataService.getFixtureMatchScheduleOverrides().catch(() => []),
  ]);

  return applyLeagueFixtureScheduleOverrides(fixture, overrides);
}

async function getFixtureMatchRegistrationStatus(
  dataService: IDataService,
  match: LeagueFixtureMatch,
) {
  const playerOfMatchData = await dataService.getPlayerOfMatchData(
    "match-registration-cron",
  );

  if (playerOfMatchData.source.status === "error") {
    return "error" as const;
  }

  const statusByMatchKey = buildMatchRegistrationStatusByMatchKey(
    playerOfMatchData.matches,
  );
  const status = statusByMatchKey[getMatchRegistrationStatusKeyForFixture(match)];

  return status?.registered ? ("registered" as const) : ("missing" as const);
}

function findLatestPlayedClubMatch(fixture: LeagueFixtureData) {
  return dedupeMatches([
    ...fixture.allClubMatches,
    ...fixture.clubMatches,
    ...fixture.lastMatches,
    ...fixture.matches,
    ...fixture.allCompetitionMatches,
  ])
    .filter(
      (match) => match.isClubMatch && match.status === "played" && !match.involvesBye,
    )
    .sort((left, right) => getMatchSortValue(right) - getMatchSortValue(left))[0];
}

function dedupeMatches(matches: LeagueFixtureMatch[]) {
  const seen = new Set<string>();
  const unique: LeagueFixtureMatch[] = [];

  for (const match of matches) {
    if (seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    unique.push(match);
  }

  return unique;
}

function getMatchSortValue(match: LeagueFixtureMatch) {
  const time = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const hour = time ? Number(time[1]) : 23;
  const minute = time ? Number(time[2]) : 59;
  const value = new Date(
    `${match.dateIso ?? ""}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`,
  ).getTime();

  return Number.isNaN(value) ? Number.MIN_SAFE_INTEGER : value;
}

async function recordMatchRegistrationCronAudit({
  actor,
  matchId,
  matchLabel,
  reason,
  registered,
}: {
  actor: AuditActor;
  matchId: string;
  matchLabel: string;
  reason: NonNullable<SendCoachMatchRegistrationNotificationResult["reason"]>;
  registered: boolean;
}) {
  await getDataService()
    .recordAuditEvent({
      actor,
      action: "notification.created",
      entityType: "notification",
      entityId: matchId || "match-registration",
      summary:
        reason === "already-registered"
          ? `Cron DT no envio recordatorio porque el partido ${matchLabel} ya tiene jugadores cargados.`
          : reason === "no-played-match"
            ? "Cron DT no encontro ultimo partido jugado para pedir carga de jugadores."
            : `Cron DT no pudo verificar si el partido ${matchLabel} tiene jugadores cargados.`,
      metadata: {
        matchId,
        matchLabel,
        reason,
        registered,
      },
    })
    .catch(() => undefined);
}

function buildEmptyResult({
  matchId,
  matchLabel,
  reason,
  registered,
}: {
  matchId: string;
  matchLabel: string;
  reason: NonNullable<SendCoachMatchRegistrationNotificationResult["reason"]>;
  registered: boolean;
}): SendCoachMatchRegistrationNotificationResult {
  return {
    coaches: 0,
    failed: 0,
    matchId,
    matchLabel,
    notificationRecordsFailed: 0,
    reason,
    registered,
    sent: 0,
    skipped: 0,
    skippedAlreadyNotified: 0,
    skippedNoSubscriptions: 0,
  };
}

async function createCoachMatchRegistrationDeliveryRecord({
  alreadyRecorded,
  coach,
  dataService,
  deliveryAttempts = 0,
  deliveryStatus,
  error,
  match,
  matchLabel,
  message,
  notificationRecordsFailed,
  recordedThisRun,
  referenceId,
  title,
}: {
  alreadyRecorded: Set<string>;
  coach: AccountUser;
  dataService: ReturnType<typeof getDataService>;
  deliveryAttempts?: number;
  deliveryStatus: Extract<
    NotificationDeliveryStatus,
    "failed" | "no_subscription" | "sent"
  >;
  error?: string;
  match: LeagueFixtureMatch;
  matchLabel: string;
  message: string;
  notificationRecordsFailed: () => void;
  recordedThisRun: Set<string>;
  referenceId: string;
  title: string;
}) {
  if (recordedThisRun.has(referenceId)) {
    return;
  }

  if (alreadyRecorded.has(referenceId) && deliveryStatus !== "sent") {
    return;
  }

  const shouldNotifyCoach = deliveryStatus === "sent";

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
      status: shouldNotifyCoach ? "unread" : "archived",
      targetRole: shouldNotifyCoach ? "coach" : "admin",
      targetUserId: shouldNotifyCoach ? coach.userId : undefined,
      targetPlayerId: shouldNotifyCoach ? coach.playerId : undefined,
      referenceId,
      url: "/fixture",
      deliveryAttempts,
      deliveryError: error,
      deliveryStatus,
      matchId: match.id,
      matchLabel,
      notificationKind: "match-registration",
      recipientName: coach.name,
      recipientPlayerId: coach.playerId,
      recipientUserId: coach.userId,
    });
    alreadyRecorded.add(referenceId);
    recordedThisRun.add(referenceId);
  } catch {
    notificationRecordsFailed();
  }
}

function getRivalName(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function formatMatchLabel(match: LeagueFixtureMatch) {
  const date = match.dateIso || match.roundDate || "Fecha sin publicar";
  const rival = getRivalName(match);
  const score =
    typeof match.localScore === "number" && typeof match.visitorScore === "number"
      ? ` · ${match.localTeam} ${match.localScore}-${match.visitorScore} ${match.visitorTeam}`
      : "";

  return `${date} · ${match.competitionKind.toUpperCase()} · vs ${rival}${score}`;
}

function getCoachMatchRegistrationReferenceId(
  userId: string,
  match: LeagueFixtureMatch,
  notificationDate?: string,
) {
  return ["match-registration", userId, match.id, notificationDate]
    .filter(Boolean)
    .join(":");
}

function hasAlreadyNotifiedCoachForMatchOnDate({
  match,
  notificationDate,
  notifications,
  referenceId,
  userId,
}: {
  match: LeagueFixtureMatch;
  notificationDate?: string;
  notifications: AppNotification[];
  referenceId: string;
  userId: string;
}) {
  if (!notificationDate) {
    return notifications.some((notification) => notification.referenceId === referenceId);
  }

  const immediateReferenceId = getCoachMatchRegistrationReferenceId(userId, match);

  return notifications.some((notification) => {
    if (notification.referenceId === referenceId) {
      return true;
    }

    return (
      notification.referenceId === immediateReferenceId &&
      getArgentinaDateKey(new Date(notification.createdAt)) === notificationDate
    );
  });
}

function getArgentinaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido.";
}
