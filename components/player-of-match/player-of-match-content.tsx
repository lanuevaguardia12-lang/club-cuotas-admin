"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CheckCircle2,
  Crown,
  Eye,
  Lock,
  Medal,
  Timer,
  Trophy,
  UsersRound,
} from "lucide-react";
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
import type {
  PlayerOfMatchData,
  PlayerOfMatchMatch,
  PlayerOfMatchResult,
} from "@/types/player-of-match";

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
  const [showResults, setShowResults] = useState(false);
  const alreadyVoted = Boolean(match.userVote);
  const votingClosed = match.votingStatus === "closed";
  const canVote = match.players.length >= 2 && !alreadyVoted && !votingClosed;

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
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={votingClosed ? "secondary" : "success"}
              className="w-fit gap-1.5"
            >
              {votingClosed ? (
                <Lock className="size-3.5" />
              ) : (
                <Timer className="size-3.5" />
              )}
              {votingClosed ? "Cerrada" : "Abierta"}
            </Badge>
            {alreadyVoted ? (
              <Badge variant="success" className="w-fit gap-1.5">
                <CheckCircle2 className="size-3.5" />
                Votado
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="border-border bg-muted/30 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <UsersRound className="text-muted-foreground size-4" />
            <span>{match.players.length} jugadores disponibles para votar</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Timer className="size-3.5" />
            <span>
              Hasta {formatDate(match.votingEndsAt)} · {match.totalVoters} votantes
            </span>
          </div>
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
        ) : votingClosed ? (
          <p className="text-muted-foreground text-sm">
            La votación de este partido ya cerró. Podés ver cómo quedó el podio.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Este partido necesita al menos dos jugadores cargados para habilitar la
            votación.
          </p>
        )}

        <div className="border-border flex flex-col gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowResults((current) => !current)}
          >
            <Eye />
            {showResults ? "Ocultar resultados" : "Ver resultados"}
          </Button>
          {showResults ? <ResultsPodium match={match} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsPodium({ match }: { match: PlayerOfMatchMatch }) {
  const podium = match.results.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-md border bg-[#012f77] text-white shadow-sm">
      <div className="relative grid gap-4 p-4 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-24 bg-[#0094dc]" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#f4ce0f] uppercase">
              Podio actual
            </p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-bold">
              <Trophy className="size-5 text-[#f4ce0f]" />
              MVP vs {match.rival}
            </h3>
          </div>
          <Badge className="border-white/20 bg-white/10 text-white">
            {match.totalVotes} votos
          </Badge>
        </div>

        <div className="relative z-10 grid items-end gap-3 sm:grid-cols-3">
          <PodiumSpot result={podium[1]} place={2} heightClass="min-h-40" />
          <PodiumSpot result={podium[0]} place={1} heightClass="min-h-52" featured />
          <PodiumSpot result={podium[2]} place={3} heightClass="min-h-36" />
        </div>

        {match.results.length === 0 || match.totalVotes === 0 ? (
          <p className="relative z-10 rounded-md border border-white/15 bg-white/10 p-3 text-sm text-white/80">
            Todavía no hay votos cargados para este partido.
          </p>
        ) : (
          <div className="relative z-10 grid gap-2 rounded-md border border-white/15 bg-white/10 p-3">
            {match.results.slice(0, 6).map((result) => (
              <div
                key={result.playerName}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  #{result.rank} {result.playerName}
                </span>
                <span className="font-semibold text-[#f4ce0f]">
                  {result.votes} {result.votes === 1 ? "voto" : "votos"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumSpot({
  featured = false,
  heightClass,
  place,
  result,
}: {
  featured?: boolean;
  heightClass: string;
  place: 1 | 2 | 3;
  result?: PlayerOfMatchResult;
}) {
  const colors = {
    1: "from-[#f4ce0f] to-[#d5a700] text-[#012f77]",
    2: "from-slate-100 to-slate-300 text-[#012f77]",
    3: "from-[#c10202] to-[#8f0101] text-white",
  };

  return (
    <div
      className={`flex ${heightClass} flex-col items-center justify-end rounded-md bg-gradient-to-b ${colors[place]} p-3 text-center shadow-lg`}
    >
      <div className="mb-3">
        {place === 1 ? (
          <Crown className="mx-auto mb-1 size-6" />
        ) : (
          <Medal className="mx-auto mb-1 size-5" />
        )}
        <p className="text-xs font-bold uppercase">Puesto {place}</p>
      </div>
      <PlayerAvatar
        className={featured ? "size-20 border-4" : "size-16 border-2"}
        name={result?.playerName ?? "-"}
        photoDataUrl={result?.photoDataUrl}
      />
      <p className="mt-3 line-clamp-2 min-h-10 text-sm font-bold">
        {result?.playerName ?? "Sin votos"}
      </p>
      <p className="mt-1 text-xs font-semibold opacity-80">
        {result ? `${result.votes} ${result.votes === 1 ? "voto" : "votos"}` : "-"}
      </p>
    </div>
  );
}

function PlayerAvatar({
  className,
  name,
  photoDataUrl,
}: {
  className: string;
  name: string;
  photoDataUrl?: string;
}) {
  return (
    <div
      className={`${className} grid place-items-center overflow-hidden rounded-full border-white/80 bg-white/20 shadow-md`}
    >
      {photoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoDataUrl}
          alt={`Foto de ${name}`}
          className="size-full object-cover"
        />
      ) : (
        <span className="text-lg font-black">{getInitials(name)}</span>
      )}
    </div>
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

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "MVP";
}
