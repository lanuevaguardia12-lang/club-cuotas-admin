"use server";

import { revalidatePath } from "next/cache";

import { userToAuditActor } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import { manualNotificationSchema } from "@/lib/manual-notification-template";
import { sendManualNotifications } from "@/lib/manual-notifications";

export async function createManualNotificationAction(input: unknown) {
  const user = await getCurrentUser();
  if (!hasPermission(user, "notifications:manage"))
    return { error: "No tenés permiso para crear notificaciones." };
  const parsed = manualNotificationSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  let result;
  try {
    result = await sendManualNotifications(
      parsed.data,
      getDataService(),
      userToAuditActor(user!),
    );
  } catch {
    return {
      error:
        "No se pudo guardar el aviso. Podés reintentar sin cambiar los destinatarios.",
    };
  }
  try {
    revalidatePath("/notifications");
  } catch {
    /* The notification is already saved. */
  }
  return { ok: true as const, ...result };
}

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = String(formData.get("notificationId") ?? "");
  const user = await getCurrentUser();

  if (!user || !hasPermission(user, "notifications:manage") || !notificationId) {
    return;
  }

  const dataService = getDataService();

  await dataService.markNotificationRead(notificationId);
  await dataService.recordAuditEvent({
    actor: userToAuditActor(user),
    action: "notification.read",
    entityType: "notification",
    entityId: notificationId,
    summary: "Notificacion marcada como leida.",
  });

  revalidatePath("/notifications");
}
