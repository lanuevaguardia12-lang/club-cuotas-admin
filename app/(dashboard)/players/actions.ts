"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const playerSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Ingresá nombre y apellido.").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  category: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
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
          status: parsed.status,
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
        summary: "Jugador dado de baja.",
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
