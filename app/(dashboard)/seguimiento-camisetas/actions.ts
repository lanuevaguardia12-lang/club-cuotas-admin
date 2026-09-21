"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const equipmentAssignmentSchema = z.object({
  assignedAt: z.string().trim().min(1, "Ingresá la fecha."),
  equipmentType: z.enum(["balls", "shirt"]),
  matchDate: z.string().trim().optional(),
  matchId: z.string().trim().optional(),
  matchLabel: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
  playerId: z.string().trim().min(1, "Elegí un jugador."),
  playerName: z.string().trim().optional(),
});

export async function recordEquipmentAssignment(formData: FormData) {
  const user = await getCurrentUser();
  assertPermission(user, "notifications:manage");

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  const parsed = equipmentAssignmentSchema.parse({
    assignedAt: String(formData.get("assignedAt") ?? ""),
    equipmentType: String(formData.get("equipmentType") ?? ""),
    matchDate: String(formData.get("matchDate") ?? ""),
    matchId: String(formData.get("matchId") ?? ""),
    matchLabel: String(formData.get("matchLabel") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    playerId: String(formData.get("playerId") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
  });
  const dataService = getDataService();
  const playerName =
    parsed.playerName ||
    (await dataService
      .getPlayersData()
      .then((data) => data.players.find((player) => player.id === parsed.playerId)?.name)
      .catch(() => undefined)) ||
    parsed.playerId;

  await dataService.createEquipmentAssignment({
    ...parsed,
    createdByName: user.name,
    createdByUserId: user.id,
    matchDate: parsed.matchDate || undefined,
    matchId: parsed.matchId || undefined,
    matchLabel: parsed.matchLabel || undefined,
    notes: parsed.notes || undefined,
    playerName,
  });

  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "api.request",
      entityType: "player",
      entityId: parsed.playerId,
      summary: `Registro de ${parsed.equipmentType === "shirt" ? "camiseta" : "pelotas"} cargado.`,
      metadata: {
        assignedAt: parsed.assignedAt,
        equipmentType: parsed.equipmentType,
        matchId: parsed.matchId || null,
        playerName,
      },
    })
    .catch(() => undefined);

  revalidatePath("/seguimiento-camisetas");
}

export async function deleteEquipmentAssignment(formData: FormData) {
  const user = await getCurrentUser();
  assertPermission(user, "notifications:manage");

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  const assignmentId = z
    .string()
    .trim()
    .min(1, "Falta el registro.")
    .parse(String(formData.get("assignmentId") ?? ""));
  const dataService = getDataService();

  await dataService.deleteEquipmentAssignment(assignmentId);

  await dataService
    .recordAuditEvent({
      actor: userToAuditActor(user),
      action: "api.request",
      entityType: "player",
      entityId: assignmentId,
      summary: "Registro de camiseta/pelotas eliminado.",
      metadata: {
        assignmentId,
      },
    })
    .catch(() => undefined);

  revalidatePath("/seguimiento-camisetas");
}
