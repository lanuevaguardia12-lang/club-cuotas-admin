import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";
import type { AppNotification } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  notificationId: z.string().trim().min(1),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const premium = await getDataService().getPremiumData();
  const notifications = premium.notifications
    .filter((notification) => canUserSeeNotification(notification, user))
    .slice(0, 50);

  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((notification) => notification.status === "unread")
      .length,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  const parsed = markReadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  const dataService = getDataService();
  const premium = await dataService.getPremiumData();
  const notification = premium.notifications.find(
    (candidate) => candidate.id === parsed.data.notificationId,
  );

  if (!notification || !canUserSeeNotification(notification, user)) {
    return NextResponse.json({ message: "Notificacion no encontrada." }, { status: 404 });
  }

  await dataService.markNotificationRead(notification.id);
  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "notification.read",
      entityType: "notification",
      entityId: notification.id,
      summary: "Notificacion marcada como leida desde la campana.",
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}

function canUserSeeNotification(notification: AppNotification, user: AuthUser) {
  const userKeys = buildNotificationUserKeys(user);

  if (notification.targetUserId || notification.targetPlayerId) {
    return (
      matchesNotificationUserKey(notification.targetUserId, userKeys) ||
      matchesNotificationUserKey(notification.targetPlayerId, userKeys)
    );
  }

  return notification.targetRole === "all" || notification.targetRole === user.role;
}

function buildNotificationUserKeys(user: AuthUser) {
  return new Set(
    [user.id, user.username, user.playerId, user.name]
      .flatMap((value) => buildNotificationKeyVariants(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function matchesNotificationUserKey(value: string | undefined, userKeys: Set<string>) {
  return buildNotificationKeyVariants(value).some((key) => userKeys.has(key));
}

function buildNotificationKeyVariants(value: string | undefined) {
  if (!value) {
    return [];
  }

  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return Array.from(new Set([normalized, slug].filter(Boolean)));
}
