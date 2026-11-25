import { z } from "zod";
export const matchAttendanceSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/, "Usá una fecha válida.")
    .refine((value) => {
      const day = value.slice(0, 10);
      const parsed = new Date(`${day}T12:00:00Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === day &&
        (!value.includes("T") ||
          (Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60))
      );
    }, "Usá una fecha válida."),
  rival: z.string().trim().min(1, "Ingresá el rival.").max(150),
  sourceType: z.enum(["league", "cup", "friendly"]),
  venue: z.string().trim().max(80),
  coachAttended: z.boolean(),
  playerIds: z
    .array(z.string().trim().min(1))
    .min(1, "Seleccioná los jugadores que participaron.")
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "No repitas jugadores."),
});
