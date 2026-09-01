"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { LNG_DEFAULT_ROSTER } from "@/lib/default-roster";
import { isPlayerPosition } from "@/lib/player-positions";
import { getDataService } from "@/services/data-service";
import type { IDataService } from "@/services/IDataService";
import type { AccountUser } from "@/types/account";

const MAX_PROFILE_PHOTO_LENGTH = 45000;

const playerSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Ingresá nombre y apellido.").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  category: z.string().trim().max(80).optional(),
  dni: z.string().trim().max(20).optional(),
  jerseyNumber: z.string().trim().max(4).optional(),
  profilePhotoDataUrl: z
    .string()
    .trim()
    .max(MAX_PROFILE_PHOTO_LENGTH, "La foto es demasiado grande.")
    .refine(
      (value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value),
      "La foto debe ser una imagen válida.",
    )
    .optional(),
  birthDate: z.string().trim().max(20).optional(),
  position: z
    .string()
    .trim()
    .refine((value) => !value || isPlayerPosition(value), "Elegí una posición válida.")
    .optional(),
  secondPosition: z
    .string()
    .trim()
    .refine((value) => !value || isPlayerPosition(value), "Elegí una posición válida.")
    .optional(),
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
  await syncPlayerAccountPhoto(
    dataService,
    parsed.id,
    parsed.name,
    parsed.profilePhotoDataUrl,
  );

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
  revalidatePath("/account");
  revalidatePath("/squad");
  revalidatePath("/player-of-match");
  revalidatePath("/");
  revalidatePath("/fee-calculator");

  return { ok: true };
}

async function syncPlayerAccountPhoto(
  dataService: Pick<IDataService, "getAccountUsers" | "updateAccountProfile">,
  playerId: string | undefined,
  playerName: string,
  profilePhotoDataUrl: string | undefined,
) {
  if (profilePhotoDataUrl === undefined) {
    return;
  }

  const account = await dataService
    .getAccountUsers()
    .then((accounts) => findLinkedPlayerAccount(accounts, playerId, playerName))
    .catch(() => undefined);

  if (!account) {
    return;
  }

  await dataService
    .updateAccountProfile({
      birthDate: account.birthDate,
      email: account.email || undefined,
      name: playerName,
      phone: account.phone || undefined,
      playerId: account.playerId,
      profilePhotoDataUrl,
      role: account.role,
      userId: account.userId,
      username: account.username,
    })
    .catch(() => undefined);
}

function findLinkedPlayerAccount(
  accounts: AccountUser[],
  playerId: string | undefined,
  playerName: string,
) {
  const playerKeys = buildLookupKeys(playerId, playerName);

  return accounts.find((account) => {
    if (account.role !== "player") {
      return false;
    }

    const accountKeys = buildLookupKeys(
      account.playerId,
      account.userId,
      account.username,
      account.name,
    );

    return [...playerKeys].some((key) => accountKeys.has(key));
  });
}

function buildLookupKeys(...values: Array<string | undefined>) {
  return new Set(
    values
      .flatMap((value) => {
        if (!value) {
          return [];
        }

        return [value, value.replace(/[-_]+/g, " ")];
      })
      .map(normalizeLookup)
      .filter(Boolean),
  );
}

function normalizeLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
