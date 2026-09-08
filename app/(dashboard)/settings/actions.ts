"use server";

import { revalidatePath } from "next/cache";

import { userToAuditActor } from "@/lib/audit";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { UpdateAppSettingsInput } from "@/types/settings";

export async function saveAppSettings(input: Partial<UpdateAppSettingsInput>) {
  const user = await getCurrentUser();
  const dataService = getDataService();
  const currentSettings = await dataService
    .getAppSettings()
    .then((result) => result.settings)
    .catch(() => DEFAULT_APP_SETTINGS);
  const settings = normalizeAppSettings({
    ...currentSettings,
    ...input,
  });

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
          paymentAlias: settings.paymentAlias,
          monthlyFee: settings.monthlyFee,
          primaryColor: settings.primaryColor,
          darkMode: settings.darkMode,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/", "layout");
  revalidatePath("/mi-cuota");
  revalidatePath("/settings");

  return {
    settings,
  };
}
