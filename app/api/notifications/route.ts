import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";
import type { AppNotification } from "@/types/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const markReadSchema = z
  .object({
    markAll: z.boolean().optional(),
    notificationId: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.markAll === true || Boolean(data.notificationId), {
    message: "Tenes que indicar notificationId o markAll.",
  });

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (user.role === "admin") {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const notifications = (await getDataService().getNotifications())
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

  if (user.role === "admin") {
    return NextResponse.json(
      {
        message:
          "Las notificaciones personales no estan disponibles para administradores.",
      },
      { status: 403 },
    );
  }

  const parsed = markReadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Payload invalido." }, { status: 400 });
  }

  const dataService = getDataService();
  const notifications = await dataService.getNotifications();
  if (parsed.data.markAll) {
    const unreadNotifications = notifications.filter(
      (candidate) =>
        candidate.status === "unread" && canUserSeeNotification(candidate, user),
    );

    await dataService.markNotificationsRead(
      unreadNotifications.map((notification) => notification.id),
    );
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "notification.read",
        entityType: "notification",
        entityId: "all-visible",
        summary: `${unreadNotifications.length} notificaciones marcadas como leidas desde la campana.`,
        metadata: {
          notificationIds: unreadNotifications
            .map((notification) => notification.id)
            .join(","),
          total: unreadNotifications.length,
        },
      })
      .catch(() => undefined);

    return NextResponse.json({ marked: unreadNotifications.length, ok: true });
  }

  const notificationId = parsed.data.notificationId;
  const notification = notifications.find((candidate) => candidate.id === notificationId);

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
