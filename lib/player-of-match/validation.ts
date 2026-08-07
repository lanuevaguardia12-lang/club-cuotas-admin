import { z } from "zod";

const editableCompetitionSchema = z.enum(["friendly"]);

export const playerOfMatchVoteSchema = z
  .object({
    firstVotePlayerName: z.string().trim().min(1, "Elegí el primer jugador."),
    matchId: z.string().trim().min(1, "No se encontró el partido."),
    secondVotePlayerName: z.string().trim().min(1, "Elegí el segundo jugador."),
  })
  .refine(
    (value) =>
      value.firstVotePlayerName.trim().toLowerCase() !==
      value.secondVotePlayerName.trim().toLowerCase(),
    {
      message: "Elegí dos jugadores distintos.",
      path: ["secondVotePlayerName"],
    },
  );

export type PlayerOfMatchVoteFormValues = z.infer<typeof playerOfMatchVoteSchema>;

export const playerOfMatchEditSchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá una fecha válida."),
    matchId: z.string().trim().min(1, "No se encontró el partido."),
    playersText: z.string().trim().min(1, "Cargá los jugadores que participaron."),
    rival: z.string().trim().min(2, "Cargá el rival."),
    sourceType: editableCompetitionSchema,
  })
  .superRefine((value, context) => {
    if (parsePlayerOfMatchPlayersText(value.playersText).length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cargá al menos dos jugadores para poder votar.",
        path: ["playersText"],
      });
    }
  });

export type PlayerOfMatchEditFormValues = z.infer<typeof playerOfMatchEditSchema>;

export function parsePlayerOfMatchPlayersText(value: string) {
  return value
    .split(/[,;\n]/)
    .map((player) => player.trim())
    .filter(Boolean);
}
