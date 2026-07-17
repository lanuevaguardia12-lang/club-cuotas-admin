"use server";

import { revalidatePath } from "next/cache";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { PlayerMonthPaymentStatus } from "@/types/dashboard";

export async function updatePlayerMonthStatus(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!playerId || !/^\d{4}-\d{2}$/.test(period) || !isMonthStatus(status)) {
    throw new Error("Datos invalidos para actualizar la cuota.");
  }

  const dataService = getDataService();
  const user = await getCurrentUser();

  await dataService.updatePlayerFeeStatus({
    playerId,
    period,
    status,
  });

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "player.fee_status_updated",
        entityType: "fee",
        entityId: `${playerId}:${period}`,
        summary: `Cuota ${period} actualizada para ${playerId}.`,
        metadata: {
          playerId,
          period,
          status,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/");
  revalidatePath(`/players/${encodeURIComponent(playerId)}`);
}

function isMonthStatus(value: string): value is PlayerMonthPaymentStatus {
  return value === "paid" || value === "unpaid";
}
