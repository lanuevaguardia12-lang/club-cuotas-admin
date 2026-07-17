"use server";

import { revalidatePath } from "next/cache";

import { userToAuditActor } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

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
