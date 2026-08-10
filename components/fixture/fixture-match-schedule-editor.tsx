"use client";

import { Pencil, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import { updateFixtureMatchSchedule } from "@/app/(dashboard)/fixture/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { cn } from "@/lib/utils";
import type { LeagueFixtureMatch } from "@/types/fixture";

interface FixtureMatchScheduleEditorProps {
  match: LeagueFixtureMatch;
}

export function FixtureMatchScheduleEditor({ match }: FixtureMatchScheduleEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultDateTime = useMemo(() => toDateTimeLocalValue(match), [match]);
  const [dateTime, setDateTime] = useState(defaultDateTime);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    startTransition(async () => {
      const result = await updateFixtureMatchSchedule({
        dateTime,
        matchId: match.id,
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
      <LoadingModal open={isPending} description="Guardando fecha del partido..." />

      <div className="flex justify-end">
        <Button
          aria-label={`Editar fecha de ${match.localTeam} vs ${match.visitorTeam}`}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            setDateTime(defaultDateTime);
            setMessage("");
            setSuccess(false);
            setIsEditing((current) => !current);
          }}
        >
          {isEditing ? <X /> : <Pencil />}
          {isEditing ? "Cerrar edición" : "Editar fecha"}
        </Button>
      </div>

      {isEditing ? (
        <form
          className="border-border bg-background grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Fecha y hora del partido</span>
            <input
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
              required
              type="datetime-local"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
            />
          </label>

          <Button disabled={isPending} type="submit">
            <Save />
            Guardar
          </Button>

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
