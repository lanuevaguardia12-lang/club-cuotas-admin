import "server-only";

import {
  manualNotificationSchema,
  renderNotificationTemplate,
} from "@/lib/manual-notification-template";
import { isPushConfigured, sendPushNotification } from "@/lib/push";
import type { IDataService } from "@/services/IDataService";
import type { AuditActor, NotificationDeliveryUpdate } from "@/types/premium";

export async function sendManualNotifications(
  input: unknown,
  dataService: IDataService,
  actor: AuditActor,
) {
  const parsed = manualNotificationSchema.parse(input);
  const [accounts, notifications, subscriptions] = await Promise.all([
    dataService.getAccountUsers(),
    dataService.getNotifications({ fresh: true }),
    dataService.getPushSubscriptions(),
  ]);
  const byId = new Map(accounts.map((user) => [user.userId, user]));
  const userIds = [...new Set(parsed.userIds)];
  if (userIds.some((id) => !byId.has(id))) {
    throw new Error(
      "Uno de los usuarios ya no está disponible. Actualizá la página y revisá los destinatarios.",
    );
  }
  const existing = new Map(
    notifications.map((notification) => [notification.referenceId, notification]),
  );
  const recipients = userIds.map((id) => {
    const user = byId.get(id)!;
    return {
      user,
      referenceId: `manual:${parsed.requestId}:${id}`,
      title: renderNotificationTemplate(parsed.title, user),
      message: renderNotificationTemplate(parsed.message, user),
    };
  });
  const fresh = recipients.filter((item) => !existing.has(item.referenceId));
  // Store the inbox before attempting push. A retry of this request never sends twice.
  await dataService.createNotifications(
    fresh.map(({ user, referenceId, title, message }) => ({
      title,
      message,
      referenceId,
      targetRole: user.role,
      targetUserId: user.userId,
      recipientUserId: user.userId,
      recipientPlayerId: user.playerId,
      recipientName: user.name || user.username,
      notificationKind: "other",
      deliveryStatus: "created",
      url: "/",
    })),
  );
  const updates: NotificationDeliveryUpdate[] = [];
  const configured = isPushConfigured();
  // Bounded parallelism keeps large recipient lists within the request duration.
  for (let at = 0; at < fresh.length; at += 5) {
    await Promise.all(
      fresh.slice(at, at + 5).map(async (item) => {
        const devices = subscriptions.filter(
          (subscription) =>
            subscription.active && subscription.userId === item.user.userId,
        );
        let sent = 0;
        let attempts = 0;
        if (configured) {
          for (const device of devices) {
            attempts += 1;
            try {
              await sendPushNotification(device, {
                title: item.title,
                body: item.message,
                tag: item.referenceId,
                url: "/",
              });
              sent += 1;
            } catch (error) {
              const status = (error as { statusCode?: number })?.statusCode;
              if (status === 404 || status === 410) {
                await dataService
                  .deletePushSubscription(device.endpoint, item.user.userId)
                  .catch(() => undefined);
              }
            }
          }
        }
        updates.push({
          referenceId: item.referenceId,
          deliveryAttempts: attempts,
          deliveryStatus:
            sent > 0 ? "sent" : devices.length === 0 ? "no_subscription" : "failed",
          deliveryError:
            !configured && devices.length
              ? "Push no configurado; el aviso está disponible en la campana."
              : attempts > 0 && sent === 0
                ? "No se pudo entregar el push; el aviso está disponible en la campana."
                : undefined,
        });
      }),
    );
  }
  let deliveryTrackingFailed = false;
  await dataService.updateNotificationDeliveries(updates).catch(() => {
    deliveryTrackingFailed = true;
  });
  await dataService
    .recordAuditEvent({
      actor,
      action: "notification.created",
      entityType: "notification",
      entityId: parsed.requestId,
      summary: `Aviso personalizado creado para ${fresh.length} usuarios.`,
      metadata: { recipients: fresh.length, title: parsed.title },
    })
    .catch(() => undefined);
  return {
    created: fresh.length,
    alreadyCreated: recipients.length - fresh.length,
    pushSent: updates.filter((update) => update.deliveryStatus === "sent").length,
    noDevice: updates.filter((update) => update.deliveryStatus === "no_subscription")
      .length,
    pushFailed: updates.filter((update) => update.deliveryStatus === "failed").length,
    deliveryTrackingFailed,
  };
}
