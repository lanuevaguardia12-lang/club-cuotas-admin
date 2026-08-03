"use server";

import { revalidatePath } from "next/cache";

import { playerOfMatchVoteSchema } from "@/lib/player-of-match/validation";
import { getCurrentUser } from "@/lib/auth/session";
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
