"use server";

import { revalidatePath } from "next/cache";

import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { userToAuditActor } from "@/lib/audit";
import { sendOpenPlayerOfMatchNotifications } from "@/lib/player-of-match-notifications";
import {
  parsePlayerOfMatchPlayersText,
  playerOfMatchEditSchema,
  playerOfMatchVoteSchema,
} from "@/lib/player-of-match/validation";
import { getDataService } from "@/services/data-service";

export interface PlayerOfMatchVoteActionResult {
  ok: boolean;
  message: string;
}

export async function submitPlayerOfMatchVote(
  input: unknown,
): Promise<PlayerOfMatchVoteActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      message: "Iniciá sesión para votar.",
    };
  }

  if (user.role === "admin") {
    return {
      ok: false,
      message: "La votación está disponible solo para usuarios habilitados.",
    };
  }

  const parsed = playerOfMatchVoteSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revisá el voto.",
    };
  }

  try {
    await getDataService().submitPlayerOfMatchVote({
      ...parsed.data,
      voterName: user.name,
      voterPlayerId: user.playerId,
      voterRole: user.role,
      voterUserId: user.id,
    });
    revalidatePath("/player-of-match");

    return {
      ok: true,
      message: "Voto registrado.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo registrar el voto.",
    };
  }
}

export async function updatePlayerOfMatchMatch(
  input: unknown,
): Promise<PlayerOfMatchVoteActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      message: "Iniciá sesión para editar.",
    };
  }

  if (!hasPermission(user, "player-of-match:manage")) {
    return {
      ok: false,
      message: "Solo el administrador puede editar amistosos.",
    };
  }

  const parsed = playerOfMatchEditSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revisá el partido.",
    };
  }

  try {
    await getDataService().updatePlayerOfMatchMatch({
      date: parsed.data.date,
      matchId: parsed.data.matchId,
      players: parsePlayerOfMatchPlayersText(parsed.data.playersText),
      rival: parsed.data.rival,
      sourceType: parsed.data.sourceType,
      updatedByName: user.name,
      updatedByUserId: user.id,
    });
    await sendOpenPlayerOfMatchNotifications({
      actor: userToAuditActor(user),
      trigger: "match-update",
    }).catch(() => undefined);
    revalidatePath("/player-of-match");

    return {
      ok: true,
      message: "Partido actualizado.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "No se pudo actualizar el partido.",
    };
  }
}
