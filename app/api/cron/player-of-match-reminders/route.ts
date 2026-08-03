import { NextRequest, NextResponse } from "next/server";

import { systemAuditActor } from "@/lib/audit";
import { sendPushNotification } from "@/lib/push";
import { getDataService } from "@/services/data-service";
import type { PushSubscriptionRecord } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const dataService = getDataService();
  const [subscriptions, premium] = await Promise.all([
    dataService.getPushSubscriptions(),
    dataService.getPremiumData(),
  ]);
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
  const alreadyNotified = new Set(
    premium.notifications
      .map((notification) => notification.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const notifiedThisRun = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const data = await dataService.getPlayerOfMatchData(userId);
    const pendingMatches = data.matches.filter(
      (match) =>
        !match.userVote && match.players.length >= 2 && match.votingStatus === "open",
    );

    if (pendingMatches.length === 0) {
      skipped += 1;
      continue;
    }

    for (const match of pendingMatches) {
      const referenceId = `mvp:${userId}:${match.id}`;

      if (alreadyNotified.has(referenceId) || notifiedThisRun.has(referenceId)) {
        skipped += 1;
        continue;
      }

      const message = `Ya está lista la votación de La Nueva Guardia vs ${match.rival} del ${formatDate(match.date)}. Votá tus dos jugadores del partido.`;
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
        await dataService.createNotification({
          title: "MVP listo para votar",
          message,
          type: "info",
          targetRole: "player",
          targetUserId: userId,
          targetPlayerId: userSubscriptions[0]?.playerId,
          referenceId,
          url: "/player-of-match",
        });
      }
    }
  }

  await dataService.recordAuditEvent({
    actor: systemAuditActor,
    action: "notification.created",
    entityType: "notification",
    entityId: "player-of-match",
    summary: `Cron envio ${sent} push de MVP.`,
    metadata: {
      failed,
      sent,
      skipped,
    },
  });

  return NextResponse.json({
    failed,
    sent,
    skipped,
    users: subscriptionsByUser.size,
  });
}

function groupSubscriptionsByUser(subscriptions: PushSubscriptionRecord[]) {
  return subscriptions.reduce((groups, subscription) => {
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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}
