"use server";

import { revalidatePath } from "next/cache";

import { userToAuditActor } from "@/lib/audit";
import { normalizeAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { UpdateAppSettingsInput } from "@/types/settings";

export async function saveAppSettings(input: UpdateAppSettingsInput) {
  const settings = normalizeAppSettings(input);
  const user = await getCurrentUser();
  const dataService = getDataService();

  await dataService.updateAppSettings(settings);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "settings.updated",
        entityType: "settings",
        entityId: "app-settings",
        summary: "Configuracion general actualizada.",
        metadata: {
          clubName: settings.clubName,
          monthlyFee: settings.monthlyFee,
          primaryColor: settings.primaryColor,
          darkMode: settings.darkMode,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");

  return {
    settings,
  };
}
