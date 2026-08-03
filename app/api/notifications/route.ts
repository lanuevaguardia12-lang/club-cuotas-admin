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
  if (notification.targetUserId) {
    return notification.targetUserId === user.id;
  }

  if (notification.targetPlayerId) {
    return notification.targetPlayerId === user.playerId;
  }

  return notification.targetRole === "all" || notification.targetRole === user.role;
}
