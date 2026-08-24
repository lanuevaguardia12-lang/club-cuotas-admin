import "server-only";

import { systemAuditActor } from "@/lib/audit";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
import type { AuthRole } from "@/types/auth";
import type { AuditActor, PushSubscriptionRecord } from "@/types/premium";
import type { PlayerDirectoryItem } from "@/types/players";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

interface BirthdayPerson {
  id: string;
  userId?: string;
  playerId?: string;
  role: AuthRole;
  name: string;
  birthDate: string;
}

interface BirthdayRecipient {
  userId: string;
  playerId?: string;
  personId: string;
  role: AuthRole;
  subscriptions: PushSubscriptionRecord[];
}

export interface SendBirthdayNotificationsResult {
  birthdays: number;
  date: string;
  failed: number;
  notificationRecordsFailed: number;
  sent: number;
  skipped: number;
  targetPlayerId?: string;
  targetUserId?: string;
  users: number;
}

export async function sendBirthdayNotifications({
  actor = systemAuditActor,
  dateIso,
  ignoreAlreadyNotified = false,
  now = new Date(),
  targetPlayerId,
  targetUserId,
}: {
  actor?: AuditActor;
  dateIso?: string;
  ignoreAlreadyNotified?: boolean;
  now?: Date;
  targetPlayerId?: string;
  targetUserId?: string;
} = {}): Promise<SendBirthdayNotificationsResult> {
  const dataService = getDataService();
  const targetDate = dateIso ?? getArgentinaDateIso(now);
  const [accountUsers, playersData, subscriptions, notifications] = await Promise.all([
    dataService.getAccountUsers().catch(() => []),
    dataService.getPlayersData().catch(() => ({ players: [] })),
    dataService.getPushSubscriptions(),
    ignoreAlreadyNotified
      ? Promise.resolve([])
      : dataService.getNotifications().catch(() => []),
  ]);
  const people = buildBirthdayPeople(accountUsers, playersData.players);
  const birthdayPeople = people
    .filter((person) => isBirthdayOnDate(person.birthDate, targetDate))
    .filter((person) => {
      if (targetUserId && person.userId !== targetUserId) {
        return false;
      }

      return !(targetPlayerId && person.playerId !== targetPlayerId);
    });
  const recipients = groupRecipientsByUser({
    accountUsers,
    people,
    players: playersData.players,
    subscriptions,
  });
  const alreadyNotified = new Set(
    notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let notificationRecordsFailed = 0;

  for (const birthdayPerson of birthdayPeople) {
    for (const recipient of recipients.values()) {
      const self = isSamePerson(recipient, birthdayPerson);
      const referenceId = getBirthdayReferenceId({
        birthdayPersonId: birthdayPerson.id,
        dateIso: targetDate,
        recipientUserId: recipient.userId,
        self,
      });

      if (
        (!ignoreAlreadyNotified && alreadyNotified.has(referenceId)) ||
        notifiedThisRun.has(referenceId)
      ) {
        skipped += 1;
        continue;
      }

      const notification = buildBirthdayNotificationContent(birthdayPerson, self);
      let recipientSent = 0;

      for (const subscription of recipient.subscriptions) {
        try {
          await sendPushNotification(subscription, {
            title: notification.title,
            body: notification.message,
            tag: referenceId,
            url: self ? "/account" : "/",
          });
          sent += 1;
          recipientSent += 1;
        } catch (error) {
          failed += 1;
          await maybeDeactivateExpiredSubscription(
            dataService,
            subscription.endpoint,
            error,
          );
        }
      }

      if (recipientSent > 0) {
        notifiedThisRun.add(referenceId);

        try {
          await dataService.createNotification({
            title: notification.title,
            message: notification.message,
            type: "success",
            targetRole: recipient.role,
            targetUserId: recipient.userId,
            targetPlayerId: recipient.playerId,
            referenceId,
            url: self ? "/account" : "/",
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
      entityId: targetDate,
      summary: `Cron envio ${sent} push de cumpleaños para ${targetDate}.`,
      metadata: {
        birthdays: birthdayPeople.length,
        failed,
        notificationRecordsFailed,
        sent,
        skipped,
        targetPlayerId: targetPlayerId ?? null,
        targetUserId: targetUserId ?? null,
        users: recipients.size,
      },
    })
    .catch(() => undefined);

  return {
    birthdays: birthdayPeople.length,
    date: targetDate,
    failed,
    notificationRecordsFailed,
    sent,
    skipped,
    targetPlayerId,
    targetUserId,
    users: recipients.size,
  };
}

function buildBirthdayPeople(
  accountUsers: AccountUser[],
  players: PlayerDirectoryItem[],
) {
  const activePlayers = players.filter((player) => player.status !== "inactive");
  const peopleById = new Map<string, BirthdayPerson>();

  for (const player of activePlayers) {
    peopleById.set(player.id, {
      id: player.id,
      playerId: player.id,
      role: "player",
      name: player.name,
      birthDate: player.birthDate,
    });
  }

  const inactivePlayerIds = new Set(
    players.filter((player) => player.status === "inactive").map((player) => player.id),
  );

  for (const account of accountUsers) {
    if (account.role === "admin") {
      continue;
    }

    if (account.playerId && inactivePlayerIds.has(account.playerId)) {
      continue;
    }

    const id = account.playerId || account.userId;
    const existing = peopleById.get(id);

    peopleById.set(id, {
      id,
      userId: account.userId,
      playerId: account.playerId || existing?.playerId,
      role: account.role,
      name: account.name || existing?.name || account.username,
      birthDate: account.birthDate || existing?.birthDate || "",
    });
  }

  return Array.from(peopleById.values()).filter((person) => person.birthDate);
}

function groupRecipientsByUser({
  accountUsers,
  people,
  players,
  subscriptions,
}: {
  accountUsers: AccountUser[];
  people: BirthdayPerson[];
  players: PlayerDirectoryItem[];
  subscriptions: PushSubscriptionRecord[];
}) {
  const accountsByUserId = new Map(
    accountUsers.map((account) => [account.userId, account]),
  );
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const inactivePlayerIds = new Set(
    players.filter((player) => player.status === "inactive").map((player) => player.id),
  );
  const recipients = new Map<string, BirthdayRecipient>();

  for (const subscription of subscriptions) {
    const account = accountsByUserId.get(subscription.userId);

    if (account?.role === "admin") {
      continue;
    }

    const personId = subscription.playerId || account?.playerId || account?.userId;

    if (!personId) {
      continue;
    }

    if (subscription.playerId && inactivePlayerIds.has(subscription.playerId)) {
      continue;
    }

    const person = peopleById.get(personId);
    const role = account?.role ?? person?.role ?? "player";
    const current = recipients.get(subscription.userId) ?? {
      userId: subscription.userId,
      playerId: subscription.playerId || account?.playerId || person?.playerId,
      personId,
      role,
      subscriptions: [],
    };

    if (
      !current.subscriptions.some(
        (candidate) => candidate.endpoint === subscription.endpoint,
      )
    ) {
      current.subscriptions.push(subscription);
    }

    recipients.set(subscription.userId, current);
  }

  return recipients;
}

function buildBirthdayNotificationContent(birthdayPerson: BirthdayPerson, self: boolean) {
  if (self) {
    return {
      title: "Feliz cumpleaños",
      message:
        "Hoy es un día muy especial. Desde el equipo de La Nueva Guardia te deseamos feliz cumpleaños.",
    };
  }

  return {
    title: "Cumpleaños del club",
    message: `Hoy es un día muy especial: es el cumpleaños de ${birthdayPerson.name}.`,
  };
}

function isSamePerson(recipient: BirthdayRecipient, person: BirthdayPerson) {
  return (
    recipient.personId === person.id ||
    recipient.userId === person.userId ||
    Boolean(recipient.playerId && recipient.playerId === person.playerId)
  );
}

function getBirthdayReferenceId({
  birthdayPersonId,
  dateIso,
  recipientUserId,
  self,
}: {
  birthdayPersonId: string;
  dateIso: string;
  recipientUserId: string;
  self: boolean;
}) {
  return `birthday:${dateIso}:${birthdayPersonId}:${recipientUserId}:${
    self ? "self" : "team"
  }`;
}

function isBirthdayOnDate(birthDate: string, dateIso: string) {
  const birthday = getBirthMonthDay(birthDate);

  return Boolean(birthday && birthday === dateIso.slice(5, 10));
}

function getBirthMonthDay(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (iso) {
    return `${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const local = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);

  if (local) {
    return `${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  }

  return null;
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
