"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

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
    await getDataService().updateFixtureMatchSchedule({
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
