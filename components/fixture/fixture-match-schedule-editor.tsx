"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import { updateFixtureMatchSchedule } from "@/app/(dashboard)/fixture/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { cn } from "@/lib/utils";
import type { FixturePlayerOption, LeagueFixtureMatch } from "@/types/fixture";

interface FixtureMatchScheduleEditorProps {
  match: LeagueFixtureMatch;
  playerOptions: FixturePlayerOption[];
}

export function FixtureMatchScheduleEditor({
  match,
  playerOptions,
}: FixtureMatchScheduleEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultDateTime = useMemo(() => toDateTimeLocalValue(match), [match]);
  const defaultScores = useMemo(() => getDefaultScores(match), [match]);
  const defaultGoalScorers = useMemo(() => match.manualGoalScorers ?? [], [match]);
  const [dateTime, setDateTime] = useState(defaultDateTime);
  const [localScore, setLocalScore] = useState(defaultScores.localScore);
  const [visitorScore, setVisitorScore] = useState(defaultScores.visitorScore);
  const [goalScorers, setGoalScorers] = useState<string[]>(defaultGoalScorers);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const parsedLocalScore = parseScoreInput(localScore);
    const parsedVisitorScore = parseScoreInput(visitorScore);

    if (
      (localScore.trim() && typeof parsedLocalScore !== "number") ||
      (visitorScore.trim() && typeof parsedVisitorScore !== "number")
    ) {
      setMessage("Los goles tienen que ser números enteros.");
      return;
    }

    if (
      (typeof parsedLocalScore === "number" && typeof parsedVisitorScore !== "number") ||
      (typeof parsedLocalScore !== "number" && typeof parsedVisitorScore === "number")
    ) {
      setMessage("Cargá ambos goles o dejá ambos vacíos.");
      return;
    }

    startTransition(async () => {
      const result = await updateFixtureMatchSchedule({
        dateTime,
        goalScorers: goalScorers.map((scorer) => scorer.trim()).filter(Boolean),
        localScore: parsedLocalScore,
        matchId: match.id,
        visitorScore: parsedVisitorScore,
      });

      setMessage(result.message);
      setSuccess(result.ok);

      if (result.ok) {
        window.setTimeout(() => {
          setIsEditing(false);
          router.refresh();
        }, 500);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <LoadingModal open={isPending} description="Guardando partido..." />

      <div className="flex justify-end">
        <Button
          aria-label={`Editar partido ${match.localTeam} vs ${match.visitorTeam}`}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            setDateTime(defaultDateTime);
            setLocalScore(defaultScores.localScore);
            setVisitorScore(defaultScores.visitorScore);
            setGoalScorers(defaultGoalScorers);
            setMessage("");
            setSuccess(false);
            setIsEditing((current) => !current);
          }}
        >
          {isEditing ? <X /> : <Pencil />}
          {isEditing ? "Cerrar edición" : "Editar partido"}
        </Button>
      </div>

      {isEditing ? (
        <form
          className="border-border bg-background grid gap-3 rounded-md border p-3 sm:grid-cols-2"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium">Fecha y hora del partido</span>
            <input
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
              required
              type="datetime-local"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">{match.localTeam}</span>
            <input
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
              inputMode="numeric"
              min={0}
              step={1}
              type="number"
              value={localScore}
              onChange={(event) => setLocalScore(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">{match.visitorTeam}</span>
            <input
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
              inputMode="numeric"
              min={0}
              step={1}
              type="number"
              value={visitorScore}
              onChange={(event) => setVisitorScore(event.target.value)}
            />
          </label>

          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Goles de La Nueva Guardia</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setGoalScorers((current) => [...current, ""])}
              >
                <Plus />
                Agregar
              </Button>
            </div>

            {goalScorers.length > 0 ? (
              <div className="grid gap-2">
                {goalScorers.map((scorer, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                    key={`goal-scorer-${index}`}
                  >
                    <select
                      className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                      value={scorer}
                      onChange={(event) =>
                        setGoalScorers((current) =>
                          current.map((value, currentIndex) =>
                            currentIndex === index ? event.target.value : value,
                          ),
                        )
                      }
                    >
                      <option value="">Seleccionar jugador</option>
                      {playerOptions.map((player) => (
                        <option key={player.id} value={player.name}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      aria-label="Eliminar goleador"
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setGoalScorers((current) =>
                          current.filter((_, currentIndex) => currentIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end sm:col-span-2">
            <Button disabled={isPending} type="submit">
              <Save />
              Guardar
            </Button>
          </div>

          {message ? (
            <p
              className={cn(
                "text-sm sm:col-span-2",
                success ? "text-emerald-700" : "text-destructive",
              )}
            >
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function toDateTimeLocalValue(match: LeagueFixtureMatch) {
  const date = match.dateIso ?? new Date().toISOString().slice(0, 10);
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "12:00";

  return `${date}T${time}`;
}

function getDefaultScores(match: LeagueFixtureMatch) {
  return {
    localScore: typeof match.localScore === "number" ? String(match.localScore) : "",
    visitorScore:
      typeof match.visitorScore === "number" ? String(match.visitorScore) : "",
  };
}

function parseScoreInput(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
