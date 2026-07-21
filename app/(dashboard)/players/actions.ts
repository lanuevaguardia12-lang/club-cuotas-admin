"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { LNG_DEFAULT_ROSTER } from "@/lib/default-roster";
import { getDataService } from "@/services/data-service";

const playerSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Ingresá nombre y apellido.").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  category: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function savePlayer(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "players:write");

  const parsed = playerSchema.parse(input);
  const dataService = getDataService();

  await dataService.upsertPlayer({
    ...parsed,
    email: parsed.email || undefined,
  });

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "player",
        entityId: parsed.id || parsed.name,
        summary: parsed.id ? "Jugador actualizado." : "Jugador creado.",
        metadata: {
          name: parsed.name,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/players");
  revalidatePath("/");
  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function deletePlayer(playerId: string) {
  const user = await getCurrentUser();
  assertPermission(user, "players:write");

  const dataService = getDataService();

  await dataService.deletePlayer(playerId);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "player",
        entityId: playerId,
        summary: "Jugador eliminado del padrón.",
        metadata: {
          playerId,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/players");
  revalidatePath("/");
  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function restoreDefaultRoster() {
  const user = await getCurrentUser();
  assertPermission(user, "maintenance:manage");

  const dataService = getDataService();

  await dataService.replacePlayers(LNG_DEFAULT_ROSTER);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "player",
        entityId: "lng-default-roster",
        summary: "Plantel base restaurado desde ABM.",
        metadata: {
          players: LNG_DEFAULT_ROSTER.length,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/players");
  revalidatePath("/");
  revalidatePath("/fee-calculator");
  revalidatePath("/cash-flow");

  return { ok: true, players: LNG_DEFAULT_ROSTER.length };
}
