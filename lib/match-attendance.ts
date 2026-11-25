import { z } from "zod";
export const matchAttendanceSchema = z.object({
  fixtureId: z.string().trim().min(1).max(300).optional(),
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
  sourceType: z.enum(["league", "cup", "friendly"], {
    error: "Elegí Liga, Copa o Amistoso.",
  }),
  venue: z.enum(["Local", "Visitante"], {
    error: "Elegí si jugaron de local o visitante.",
  }),
  coachAttended: z.boolean(),
  playerIds: z
    .array(z.string().trim().min(1))
    .min(1, "Seleccioná los jugadores que participaron.")
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "No repitas jugadores."),
});

export type MatchAttendanceDraft = Omit<
  import("@/types/match-attendance").UpsertMatchAttendanceInput,
  "sourceType" | "venue"
> & {
  sourceType: "league" | "cup" | "friendly" | "";
  venue: "Local" | "Visitante" | "";
};
export interface MatchAttendanceInitial extends MatchAttendanceDraft {
  convokedPlayerIds: string[];
  unresolvedConvokedNames: string[];
}
const normalizedName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
export function attendanceVenue(value: string): MatchAttendanceDraft["venue"] {
  return normalizedName(value) === "local"
    ? "Local"
    : normalizedName(value) === "visitante"
      ? "Visitante"
      : "";
}
export function attendanceToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function initialMatchAttendance(
  params: {
    date?: string;
    rival?: string;
    sourceType?: string;
    player?: string | string[];
    convoked?: string;
    fixtureId?: string;
  },
  data: import("@/types/match-attendance").MatchAttendanceData,
): MatchAttendanceInitial {
  const candidateDate = params.date?.slice(0, 10) ?? "";
  const date = z.iso.date().safeParse(candidateDate).success
    ? candidateDate
    : attendanceToday();
  const rival = (params.rival ?? "").trim().slice(0, 150);
  const sourceType =
    params.sourceType === "league" ||
    params.sourceType === "cup" ||
    params.sourceType === "friendly"
      ? params.sourceType
      : "";
  const names =
    params.convoked === "1"
      ? (Array.isArray(params.player)
          ? params.player
          : params.player
            ? [params.player]
            : []
        ).slice(0, 100)
      : [];
  const convokedPlayerIds: string[] = [],
    unresolvedConvokedNames: string[] = [];
  for (const name of names) {
    const candidates = data.players.filter(
      (p) => normalizedName(p.name) === normalizedName(name),
    );
    if (candidates.length === 1) convokedPlayerIds.push(candidates[0].id);
    else unresolvedConvokedNames.push(name.slice(0, 150));
  }
  const linked = params.fixtureId
    ? data.matches.find((match) => match.fixtureId === params.fixtureId)
    : undefined;
  const existing =
    linked ??
    (sourceType && rival
      ? data.matches.find(
          (match) =>
            match.date.slice(0, 10) === date &&
            normalizedName(match.rival) === normalizedName(rival) &&
            (match.sourceType ?? "league") === sourceType,
        )
      : undefined);
  return {
    fixtureId: existing?.fixtureId ?? params.fixtureId,
    id: existing?.id,
    date: existing?.date ?? date,
    rival: existing?.rival ?? rival,
    sourceType: existing?.sourceType ?? sourceType,
    // Fixture home/away is deliberately not used: the DT confirms it.
    venue: existing ? attendanceVenue(existing.venue) : "",
    coachAttended: existing?.coachAttended ?? true,
    playerIds: existing
      ? (existing.participantPlayerIds ??
        data.players.filter((p) => existing.players.includes(p.name)).map((p) => p.id))
      : [...new Set(convokedPlayerIds)],
    convokedPlayerIds: [...new Set(convokedPlayerIds)],
    unresolvedConvokedNames,
  };
}
