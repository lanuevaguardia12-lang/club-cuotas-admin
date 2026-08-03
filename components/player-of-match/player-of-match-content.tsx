"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, CheckCircle2, Trophy, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import { submitPlayerOfMatchVote } from "@/app/(dashboard)/player-of-match/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  playerOfMatchVoteSchema,
  type PlayerOfMatchVoteFormValues,
} from "@/lib/player-of-match/validation";
import type { PlayerOfMatchData, PlayerOfMatchMatch } from "@/types/player-of-match";

interface PlayerOfMatchContentProps {
  data: PlayerOfMatchData;
}

export function PlayerOfMatchContent({ data }: PlayerOfMatchContentProps) {
  if (data.matches.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Trophy className="text-muted-foreground mx-auto size-8" />
          <h2 className="mt-4 text-lg font-semibold">{data.emptyState.title}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {data.emptyState.description}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {data.matches.map((match) => (
        <MatchVoteCard key={match.id} match={match} />
      ))}
    </section>
  );
}

function MatchVoteCard({ match }: { match: PlayerOfMatchMatch }) {
  const alreadyVoted = Boolean(match.userVote);
  const canVote = match.players.length >= 2 && !alreadyVoted;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="text-primary size-5" />
              {match.title}
            </CardTitle>
            <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <CalendarDays className="size-4" />
              {formatDate(match.date)}
            </p>
          </div>
          {alreadyVoted ? (
            <Badge variant="success" className="w-fit gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Votado
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border p-3 text-sm">
          <UsersRound className="text-muted-foreground size-4" />
          <span>{match.players.length} jugadores disponibles para votar</span>
        </div>

        {match.userVote ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <VoteResult label="Primer voto" value={match.userVote.firstVotePlayerName} />
            <VoteResult
              label="Segundo voto"
              value={match.userVote.secondVotePlayerName}
            />
          </div>
        ) : canVote ? (
          <PlayerVoteForm match={match} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Este partido necesita al menos dos jugadores cargados para habilitar la
            votación.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerVoteForm({ match }: { match: PlayerOfMatchMatch }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<PlayerOfMatchVoteFormValues>({
    defaultValues: {
      firstVotePlayerName: "",
      matchId: match.id,
      secondVotePlayerName: "",
    },
    resolver: zodResolver(playerOfMatchVoteSchema),
  });
  const firstVote = watch("firstVotePlayerName");
  const secondVote = watch("secondVotePlayerName");

  function onSubmit(values: PlayerOfMatchVoteFormValues) {
    setMessage("");
    setSuccess(false);

    startTransition(async () => {
      const result = await submitPlayerOfMatchVote(values);

      setMessage(result.message);
      setSuccess(result.ok);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <LoadingModal open={isPending} description="Guardando voto..." />
      <input type="hidden" {...register("matchId")} />
      <VoteSelect
        disabledOption={secondVote}
        error={errors.firstVotePlayerName?.message}
        label="Primer voto"
        players={match.players}
        registration={register("firstVotePlayerName")}
      />
      <VoteSelect
        disabledOption={firstVote}
        error={errors.secondVotePlayerName?.message}
        label="Segundo voto"
        players={match.players}
        registration={register("secondVotePlayerName")}
      />
      <Button type="submit" disabled={isPending}>
        <Trophy />
        Votar jugador del partido
      </Button>
      {message ? (
        <p
          className={`text-sm font-medium ${
            success ? "text-primary" : "text-destructive"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

function VoteSelect({
  disabledOption,
  error,
  label,
  players,
  registration,
}: {
  disabledOption?: string;
  error?: string;
  label: string;
  players: string[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        {...registration}
      >
        <option value="">Elegí un jugador</option>
        {players.map((player) => (
          <option
            key={player}
            value={player}
            disabled={normalizeValue(player) === normalizeValue(disabledOption)}
          >
            {player}
          </option>
        ))}
      </select>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </label>
  );
}

function VoteResult({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function normalizeValue(value?: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
