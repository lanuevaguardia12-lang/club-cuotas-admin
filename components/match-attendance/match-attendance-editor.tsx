"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMatchAttendance } from "@/app/(dashboard)/match-attendance/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AttendanceMatch,
  UpsertMatchAttendanceInput,
} from "@/types/match-attendance";
import type { PlayerDirectoryItem } from "@/types/players";

type Player = Pick<PlayerDirectoryItem, "id" | "name" | "status">;
const field = "border-input bg-background w-full rounded-md border px-3 py-2";
export function MatchAttendanceEditor({
  matches,
  players,
  initial,
}: {
  matches: AttendanceMatch[];
  players: Player[];
  initial: Pick<UpsertMatchAttendanceInput, "date" | "rival" | "sourceType" | "venue">;
}) {
  const router = useRouter();
  const empty: UpsertMatchAttendanceInput = {
    ...initial,
    coachAttended: true,
    playerIds: [],
  };
  const [draft, setDraft] = useState(empty);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  function edit(match: AttendanceMatch) {
    setDraft({
      id: match.id,
      date: match.date,
      rival: match.rival,
      sourceType: match.sourceType ?? "league",
      venue: match.venue,
      coachAttended: match.coachAttended,
      playerIds:
        match.participantPlayerIds ??
        players.filter((p) => match.players.includes(p.name)).map((p) => p.id),
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await saveMatchAttendance(draft);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Partido y asistencias guardados.");
      setDraft(empty);
      router.refresh();
    });
  }
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{draft.id ? "Editar asistencia" : "Registrar partido"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <fieldset disabled={pending} className="grid gap-4 disabled:opacity-60">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Fecha
                  <input
                    required
                    type="date"
                    value={draft.date.slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Rival
                  <input
                    required
                    maxLength={150}
                    value={draft.rival}
                    onChange={(e) => setDraft({ ...draft, rival: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Competencia
                  <select
                    value={draft.sourceType}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        sourceType: e.target
                          .value as UpsertMatchAttendanceInput["sourceType"],
                      })
                    }
                    className={field}
                  >
                    <option value="league">Liga</option>
                    <option value="cup">Copa</option>
                    <option value="friendly">Amistoso</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Condición
                  <select
                    value={draft.venue}
                    onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
                    className={field}
                  >
                    <option value="">Sin especificar</option>
                    {draft.venue && !["Local", "Visitante"].includes(draft.venue) ? (
                      <option value={draft.venue}>{draft.venue}</option>
                    ) : null}
                    <option value="Local">Local</option>
                    <option value="Visitante">Visitante</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.coachAttended}
                  onChange={(e) =>
                    setDraft({ ...draft, coachAttended: e.target.checked })
                  }
                />
                Asistió el DT
              </label>
              <div>
                <p className="mb-2 font-medium">
                  Jugadores que participaron ({draft.playerIds.length})
                </p>
                <input
                  aria-label="Buscar jugador"
                  placeholder="Buscar jugador"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={field}
                />
                <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                  {players
                    .filter((p) =>
                      p.name
                        .toLocaleLowerCase("es")
                        .includes(search.toLocaleLowerCase("es")),
                    )
                    .map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded border p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.playerIds.includes(p.id)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              playerIds: e.target.checked
                                ? [...draft.playerIds, p.id]
                                : draft.playerIds.filter((id) => id !== p.id),
                            })
                          }
                        />
                        {p.name}
                        {p.status === "inactive" ? " (inactivo)" : ""}
                      </label>
                    ))}
                </div>
                {draft.id ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    Los nombres históricos que ya no están en el plantel se conservan al
                    guardar.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="submit">
                  {pending ? "Guardando…" : "Guardar asistencia"}
                </Button>
                {draft.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDraft(empty);
                      setMessage("");
                    }}
                  >
                    Cancelar edición
                  </Button>
                ) : null}
              </div>
            </fieldset>
            {message ? (
              <p role="status" className="text-sm">
                {message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Partidos registrados ({matches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Rival</th>
                  <th className="p-2">Jugadores</th>
                  <th className="p-2">DT</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...matches].reverse().map((match) => (
                  <tr key={match.id} className="border-t">
                    <td className="p-2">{match.date.slice(0, 10)}</td>
                    <td className="p-2">{match.rival}</td>
                    <td className="p-2">{match.players.length}</td>
                    <td className="p-2">{match.coachAttended ? "Sí" : "No"}</td>
                    <td className="p-2">
                      <Button
                        type="button"
                        disabled={pending}
                        variant="outline"
                        size="sm"
                        onClick={() => edit(match)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
