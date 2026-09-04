"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { TEAM_SHORT_NAME_MAX_LENGTH } from "@/lib/team-profiles";
import { getDataService } from "@/services/data-service";

const MAX_TEAM_CREST_LENGTH = 45000;

const teamProfileSchema = z.object({
  crestDataUrl: z
    .string()
    .trim()
    .max(MAX_TEAM_CREST_LENGTH, "El escudo es demasiado grande.")
    .refine(
      (value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value),
      "El escudo debe ser una imagen valida.",
    )
    .optional(),
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Ingresa el nombre del equipo.").max(120),
  shortName: z
    .string()
    .trim()
    .min(2, "Ingresa un nombre corto.")
    .max(TEAM_SHORT_NAME_MAX_LENGTH, `Maximo ${TEAM_SHORT_NAME_MAX_LENGTH} caracteres.`),
});

export async function saveTeamProfile(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "teams:manage");

  const parsed = teamProfileSchema.parse(input);
  const dataService = getDataService();

  await dataService.upsertTeamProfile(parsed);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityId: parsed.id || parsed.name,
        entityType: "team",
        metadata: {
          name: parsed.name,
          shortName: parsed.shortName,
        },
        summary: parsed.id ? "Equipo actualizado." : "Equipo creado.",
      })
      .catch(() => undefined);
  }

  revalidatePath("/teams");
  revalidatePath("/fixture");
  revalidatePath("/");

  return { ok: true };
}
