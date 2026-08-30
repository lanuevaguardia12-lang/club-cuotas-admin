"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import {
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { sendCoachMatchRegistrationNotification } from "@/lib/match-registration-notifications";
import { getDataService } from "@/services/data-service";
import type { IDataService } from "@/services/IDataService";
import type { LeagueFixtureMatch } from "@/types/fixture";

export interface FixtureScheduleActionResult {
  ok: boolean;
  message: string;
}

const fixtureScheduleSchema = z
  .object({
    dateTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Usá una fecha y hora válida."),
    goalScorers: z.array(z.string().trim().min(1).max(120)).optional(),
    localPenaltyScore: z.number().int().min(0).max(99).optional(),
    localScore: z.number().int().min(0).max(99).optional(),
    matchId: z.string().trim().min(1, "No se encontró el partido."),
    visitorPenaltyScore: z.number().int().min(0).max(99).optional(),
    visitorScore: z.number().int().min(0).max(99).optional(),
  })
  .superRefine((value, context) => {
    const hasLocalPenalty = typeof value.localPenaltyScore === "number";
    const hasVisitorPenalty = typeof value.visitorPenaltyScore === "number";

    if (hasLocalPenalty !== hasVisitorPenalty) {
      context.addIssue({
        code: "custom",
        message: "Cargá los penales de ambos equipos o dejá ambos vacíos.",
        path: ["localPenaltyScore"],
      });
    }
  });

export async function updateFixtureMatchSchedule(
  input: unknown,
): Promise<FixtureScheduleActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      message: "Iniciá sesión para editar el fixture.",
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false,
      message: "Solo el administrador puede editar fecha y hora del partido.",
    };
  }

  const parsed = fixtureScheduleSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Revisá la fecha del partido.",
    };
  }

  try {
    const dataService = getDataService();
    const resultWasLoaded =
      typeof parsed.data.localScore === "number" &&
      typeof parsed.data.visitorScore === "number";
    const match = resultWasLoaded
      ? await findFixtureMatch(dataService, parsed.data.matchId).catch((error) => {
          console.error("No se pudo encontrar el partido para notificar al DT", error);
          return undefined;
        })
      : undefined;

    await dataService.updateFixtureMatchSchedule({
      dateTime: parsed.data.dateTime,
      goalScorers: parsed.data.goalScorers,
      localPenaltyScore: parsed.data.localPenaltyScore,
      localScore: parsed.data.localScore,
      matchId: parsed.data.matchId,
      updatedByName: user.name,
      updatedByUserId: user.id,
      visitorPenaltyScore: parsed.data.visitorPenaltyScore,
      visitorScore: parsed.data.visitorScore,
    });

    if (match) {
      await sendCoachMatchRegistrationNotification({
        actor: userToAuditActor(user),
        match,
      }).catch((error) => {
        console.error("No se pudo notificar al DT para registrar jugadores", error);
      });
    }

    revalidatePath("/fixture");
    revalidatePath("/player-of-match");

    return {
      ok: true,
      message: "Partido actualizado.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la fecha del partido.",
    };
  }
}

async function findFixtureMatch(
  dataService: IDataService,
  matchId: string,
): Promise<LeagueFixtureMatch | undefined> {
  const [fixture, overrides] = await Promise.all([
    getLeagueFixtureData(),
    dataService.getFixtureMatchScheduleOverrides().catch(() => []),
  ]);
  const data = applyLeagueFixtureScheduleOverrides(fixture, overrides);
  const matches = [
    ...data.allClubMatches,
    ...data.clubMatches,
    ...data.matches,
    ...data.allCompetitionMatches,
  ];

  return matches.find((match) => match.id === matchId);
}
