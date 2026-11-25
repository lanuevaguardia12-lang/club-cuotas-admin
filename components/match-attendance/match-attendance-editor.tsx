"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMatchAttendance } from "@/app/(dashboard)/match-attendance/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceMatch } from "@/types/match-attendance";
import {
  attendanceVenue,
  type MatchAttendanceDraft,
  type MatchAttendanceInitial,
} from "@/lib/match-attendance";
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
  initial: MatchAttendanceInitial;
}) {
  const router = useRouter();
  const { convokedPlayerIds, unresolvedConvokedNames, ...initialDraft } = initial;
  const empty: MatchAttendanceDraft = initialDraft;
  const [draft, setDraft] = useState(empty);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const calledPlayerIds = draft.fixtureId === initial.fixtureId ? convokedPlayerIds : [];
  function edit(match: AttendanceMatch) {
    setDraft({
      fixtureId: match.fixtureId,
      id: match.id,
      date: match.date,
      rival: match.rival,
      sourceType: match.sourceType ?? "",
      venue: attendanceVenue(match.venue),
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
      try {
        const result = await saveMatchAttendance(draft);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setMessage(result.warning ?? "Partido y asistencias guardados.");
        if (result.id) setDraft((previous) => ({ ...previous, id: result.id }));
        router.refresh();
      } catch {
        setMessage(
          "No pudimos confirmar el guardado. Revisá los partidos registrados antes de volver a intentarlo.",
        );
      }
    });
  }
  const matchesSearch = (player: Player) =>
    player.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"));
  function playerCheckbox(player: Player) {
    return (
      <label
        key={player.id}
        className="flex min-h-11 items-center gap-3 rounded border p-2 text-sm"
      >
        <input
          type="checkbox"
          className="size-5 shrink-0"
          checked={draft.playerIds.includes(player.id)}
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              playerIds: event.target.checked
                ? [...previous.playerIds, player.id]
                : previous.playerIds.filter((id) => id !== player.id),
            }))
          }
        />
        <span>
          {player.name}
          {player.status === "inactive" ? " (inactivo)" : ""}
        </span>
      </label>
    );
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
                    required
                    aria-label="Competencia"
                    value={draft.sourceType}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        sourceType: e.target.value as MatchAttendanceDraft["sourceType"],
                      })
                    }
                    className={field}
                  >
                    <option value="">Elegí la competencia</option>
                    <option value="league">Liga</option>
                    <option value="cup">Copa</option>
                    <option value="friendly">Amistoso</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Condición
                  <select
                    required
                    aria-label="Condición"
                    value={draft.venue}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        venue: e.target.value as MatchAttendanceDraft["venue"],
                      })
                    }
                    className={field}
                  >
                    <option value="">Elegí local o visitante</option>
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
                  Jugadores que ingresaron ({draft.playerIds.length})
                </p>
                <input
                  aria-label="Buscar jugador"
                  placeholder="Buscar jugador"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={field}
                />
                {calledPlayerIds.length > 0 ? (
                  <>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Los convocados vienen marcados. Destildá a quienes no ingresaron y
                      tildá a quienes sí jugaron.
                    </p>
                    <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {players
                        .filter((p) => calledPlayerIds.includes(p.id))
                        .filter(matchesSearch)
                        .map(playerCheckbox)}
                    </div>
                    <details className="mt-3 rounded-md border p-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Otros jugadores del plantel
                      </summary>
                      <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                        {players
                          .filter((p) => !calledPlayerIds.includes(p.id))
                          .filter(matchesSearch)
                          .map(playerCheckbox)}
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground mt-2 text-sm">
                      No hay una convocatoria cargada para este partido. Marcá los
                      jugadores que ingresaron.
                    </p>
                    <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                      {players.filter(matchesSearch).map(playerCheckbox)}
                    </div>
                  </>
                )}
                {draft.fixtureId === initial.fixtureId &&
                unresolvedConvokedNames.length ? (
                  <p role="status" className="text-muted-foreground mt-2 text-sm">
                    Hay convocados sin una ficha identificable en el plantel:{" "}
                    {unresolvedConvokedNames.join(", ")}. Revisá sus fichas antes de
                    registrarlos.
                  </p>
                ) : null}
                {draft.id ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    Los nombres históricos que ya no están en el plantel se conservan al
                    guardar.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="submit">
                  {pending
                    ? "Guardando…"
                    : draft.id
                      ? "Actualizar asistencia"
                      : "Guardar asistencia"}
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
