import { z } from "zod";

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
