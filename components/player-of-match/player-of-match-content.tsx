"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CheckCircle2,
  Crown,
  Eye,
  Flame,
  Lock,
  Medal,
  Pencil,
  Percent,
  Save,
  Sparkles,
  Timer,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import {
  submitPlayerOfMatchVote,
  updatePlayerOfMatchMatch,
} from "@/app/(dashboard)/player-of-match/actions";
import {
  CompetitionBadge,
  getCompetitionCardClass,
} from "@/components/fixture/competition-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import { cn } from "@/lib/utils";
import {
  playerOfMatchEditSchema,
  playerOfMatchVoteSchema,
  type PlayerOfMatchEditFormValues,
  type PlayerOfMatchVoteFormValues,
} from "@/lib/player-of-match/validation";
import type {
  PlayerHistoricalStreakRankingRow,
  PlayerOfMatchData,
  PlayerOfMatchMatch,
  PlayerOfMatchResult,
  PlayerStreakRankingRow,
} from "@/types/player-of-match";

interface PlayerOfMatchContentProps {
  canManage: boolean;
  canVote: boolean;
  data: PlayerOfMatchData;
}

type PlayerOfMatchTab = "mvp" | "ranking" | "rachas";

export function PlayerOfMatchContent({
  canManage,
  canVote,
  data,
}: PlayerOfMatchContentProps) {
  const [activeTab, setActiveTab] = useState<PlayerOfMatchTab>("mvp");
  const currentMatches = data.matches.filter(isCurrentPlayerOfMatch);
  const currentMatchIds = new Set(currentMatches.map((match) => match.id));
  const historyMatches = data.matches.filter(
    (match) => isHistoryPlayerOfMatch(match) && !currentMatchIds.has(match.id),
  );
  const hasRankingData =
    data.rankings.mvp.length > 0 ||
    data.rankings.historicalStreaks.length > 0 ||
    data.rankings.streaks.length > 0 ||
    data.rankings.attendance.length > 0;

  if (currentMatches.length === 0 && historyMatches.length === 0 && !hasRankingData) {
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
    <section className="grid min-w-0 gap-5 overflow-hidden">
      <nav className="border-border bg-card flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-md border p-1">
        {[
          { label: "MVP", value: "mvp" as const },
          { label: "Ranking", value: "ranking" as const },
          { label: "Rachas", value: "rachas" as const },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "mvp" ? (
        <MvpTab
          canManage={canManage}
          canVote={canVote}
          currentPlayerName={data.rankings.currentPlayer?.playerName}
          currentMatches={currentMatches}
          historyMatches={historyMatches}
        />
      ) : null}
      {activeTab === "ranking" ? <RankingTab data={data} /> : null}
      {activeTab === "rachas" ? <StreaksTab data={data} /> : null}
    </section>
  );
}

function MvpTab({
  canManage,
  canVote,
  currentPlayerName,
  currentMatches,
  historyMatches,
}: {
  canManage: boolean;
  canVote: boolean;
  currentPlayerName?: string;
  currentMatches: PlayerOfMatchMatch[];
  historyMatches: PlayerOfMatchMatch[];
}) {
  return (
    <section className="grid gap-6">
      <div className="grid gap-4">
        <div>
          <p className="text-muted-foreground text-sm font-medium">MVP pendiente</p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">
            Partidos para votar
          </h2>
        </div>
        {currentMatches.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {currentMatches.map((match) => (
              <MatchVoteCard
                canManage={canManage}
                canVote={canVote}
                currentPlayerName={currentPlayerName}
                key={match.id}
                match={match}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-muted-foreground p-5 text-sm">
              No hay votaciones disponibles ahora. Cuando se carguen jugadores de un
              partido ya disputado, va a aparecer acá.
            </CardContent>
          </Card>
        )}
      </div>

      <details className="group border-border bg-card rounded-md border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-medium">Historial y resultados</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Tus votaciones anteriores y podios de partidos cerrados.
            </p>
          </div>
          <Badge variant="secondary">{historyMatches.length}</Badge>
        </summary>
        <div className="border-border grid gap-4 border-t p-4">
          {historyMatches.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {historyMatches.map((match) => (
                <MatchVoteCard
                  canManage={canManage}
                  canVote={canVote}
                  currentPlayerName={currentPlayerName}
                  key={match.id}
                  match={match}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no hay historial para mostrar.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function RankingTab({ data }: { data: PlayerOfMatchData }) {
  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <p className="text-muted-foreground text-sm font-medium">Ranking MVP</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal text-balance">
          Podios acumulados del plantel
        </h2>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="max-w-full overflow-hidden">
            <table className="w-full table-fixed text-xs sm:text-sm">
              <colgroup>
                <col className="w-10 sm:w-14" />
                <col />
                <col className="w-11 sm:w-20" />
                <col className="w-11 sm:w-20" />
                <col className="w-11 sm:w-20" />
                <col className="w-12 sm:w-24" />
              </colgroup>
              <thead>
                <tr className="border-border bg-muted/40 border-b">
                  <TableHead>#</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead className="text-center">
                    <span className="sm:hidden">1º</span>
                    <span className="hidden sm:inline">1º puesto</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="sm:hidden">2º</span>
                    <span className="hidden sm:inline">2º puesto</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="sm:hidden">3º</span>
                    <span className="hidden sm:inline">3º puesto</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="sm:hidden">Tot</span>
                    <span className="hidden sm:inline">Total</span>
                  </TableHead>
                </tr>
              </thead>
              <tbody>
                {data.rankings.mvp.length > 0 ? (
                  data.rankings.mvp.map((row) => (
                    <tr
                      key={row.playerName}
                      className="border-border border-b last:border-0"
                    >
                      <td className="px-2 py-3 font-semibold sm:px-4">#{row.rank}</td>
                      <td className="min-w-0 px-2 py-3 sm:px-4">
                        <RankingPlayer
                          compact
                          name={row.playerName}
                          photoDataUrl={row.photoDataUrl}
                        />
                      </td>
                      <td className="px-2 py-3 text-center font-semibold sm:px-4">
                        {row.firstPlaces}
                      </td>
                      <td className="px-2 py-3 text-center sm:px-4">
                        {row.secondPlaces}
                      </td>
                      <td className="px-2 py-3 text-center sm:px-4">{row.thirdPlaces}</td>
                      <td className="px-2 py-3 text-center font-semibold sm:px-4">
                        {row.totalPodiums}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted-foreground h-24 px-4 text-center"
                    >
                      Todavía no hay podios cerrados para armar el ranking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function StreaksTab({ data }: { data: PlayerOfMatchData }) {
  const current = data.rankings.currentPlayer;

  return (
    <section className="grid min-w-0 gap-5">
      <div>
        <p className="text-muted-foreground text-sm font-medium">Rachas y asistencia</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal text-balance">
          Ranking de jugadores con mayor cantidad de asistencia consecutiva
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Incluye partidos amistosos, copa y liga desde el inicio del campeonato.
        </p>
      </div>

      {current ? (
        <Card className="overflow-hidden">
          <CardContent className="from-primary to-secondary text-primary-foreground grid gap-4 bg-linear-to-br p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <PlayerAvatar
              className="size-16 border-2"
              name={current.playerName}
              photoDataUrl={current.photoDataUrl}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">Tu racha</p>
              <h2 className="mt-1 text-xl font-semibold text-balance">
                Tenés {current.currentStreak} partidos consecutivos
              </h2>
              <p className="mt-1 text-sm text-white/80">
                {current.playerName} · puesto #{current.streakRank ?? "-"} en rachas
              </p>
              <p className="mt-1 text-xs font-medium text-white/75">
                Tu récord histórico: {current.bestStreak} partidos.
              </p>
            </div>
            <div className="grid size-16 place-items-center rounded-md bg-white text-2xl font-semibold text-[#012f77]">
              {current.currentStreak}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <HistoricalStreakPodium rows={data.rankings.historicalStreaks.slice(0, 3)} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="text-primary size-5" />
              Rachas al día de hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <StreakRankingTable rows={data.rankings.streaks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="text-primary size-5" />
              Asistencia
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RankingList
              emptyText="Todavía no hay asistencia para mostrar."
              rows={data.rankings.attendance.map((row) => ({
                detail: `${row.attendedMatches}/${row.totalMatches} partidos asistidos`,
                key: row.playerId,
                name: row.playerName,
                photoDataUrl: row.photoDataUrl,
                rank: row.rank,
                value: formatPercent(row.attendanceRate),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function HistoricalStreakPodium({ rows }: { rows: PlayerHistoricalStreakRankingRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="text-primary size-5" />
          Récords históricos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {rows.map((row) => (
            <div
              key={row.playerId}
              className={cn(
                "bg-muted/50 grid min-w-0 gap-2 rounded-md border p-2 text-center",
                row.rank === 1 && "border-[#f4ce0f] bg-[#f4ce0f]/15",
              )}
            >
              <span className="text-muted-foreground text-xs font-bold">#{row.rank}</span>
              <PlayerAvatar
                className="mx-auto size-11 border-2 sm:size-14"
                name={row.playerName}
                photoDataUrl={row.photoDataUrl}
              />
              <p className="line-clamp-2 min-h-8 text-xs leading-tight font-semibold">
                {row.playerName}
              </p>
              <p className="text-primary text-lg font-bold">{row.bestStreak}</p>
              <p className="text-muted-foreground text-[0.68rem] leading-tight">
                rachas consecutivas
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StreakRankingTable({ rows }: { rows: PlayerStreakRankingRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Todavía no hay rachas para mostrar.
      </p>
    );
  }

  return (
    <div className="max-w-full overflow-hidden">
      <table className="w-full table-fixed text-xs sm:text-sm">
        <colgroup>
          <col className="w-10 sm:w-14" />
          <col />
          <col className="w-20 sm:w-28" />
          <col className="w-24 sm:w-40" />
        </colgroup>
        <thead>
          <tr className="border-border bg-muted/40 border-b">
            <TableHead>#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-center leading-tight">
              Rachas
              <br />
              consecutivas
            </TableHead>
            <TableHead>
              <span className="sm:hidden">Última</span>
              <span className="hidden sm:inline">Última asistencia</span>
            </TableHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId} className="border-border border-b last:border-0">
              <td className="px-2 py-3 font-semibold sm:px-4">#{row.rank}</td>
              <td className="min-w-0 px-2 py-3 sm:px-4">
                <RankingPlayer
                  compact
                  name={row.playerName}
                  photoDataUrl={row.photoDataUrl}
                />
              </td>
              <td className="px-2 py-3 text-center sm:px-4">
                <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold">
                  <Flame className="size-3.5 fill-current sm:size-4" />
                  {row.currentStreak}
                </span>
              </td>
              <td className="text-muted-foreground min-w-0 truncate px-2 py-3 sm:px-4">
                {row.lastAttendanceRival
                  ? `vs ${row.lastAttendanceRival}`
                  : "Sin asistencia todavía"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingList({
  emptyText,
  rows,
}: {
  emptyText: string;
  rows: Array<{
    detail: string;
    key: string;
    name: string;
    photoDataUrl?: string;
    rank: number;
    value: string;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">{emptyText}</p>;
  }

  return (
    <div className="divide-border divide-y">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3"
        >
          <span className="text-muted-foreground w-8 text-sm font-semibold">
            #{row.rank}
          </span>
          <RankingPlayer name={row.name} photoDataUrl={row.photoDataUrl} />
          <div className="text-right">
            <p className="font-semibold">{row.value}</p>
            <p className="text-muted-foreground text-xs">{row.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingPlayer({
  compact = false,
  name,
  photoDataUrl,
}: {
  compact?: boolean;
  name: string;
  photoDataUrl?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-3")}>
      <PlayerAvatar
        className={cn(compact ? "size-8 border-2" : "size-9 border-2")}
        name={name}
        photoDataUrl={photoDataUrl}
      />
      <span className={cn("truncate font-medium", compact && "text-xs sm:text-sm")}>
        {name}
      </span>
    </div>
  );
}

function MatchVoteCard({
  canManage,
  canVote: canUserVote,
  currentPlayerName,
  match,
}: {
  canManage: boolean;
  canVote: boolean;
  currentPlayerName?: string;
  match: PlayerOfMatchMatch;
}) {
  const [showResults, setShowResults] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const alreadyVoted = Boolean(match.userVote);
  const votingClosed = match.votingStatus === "closed";
  const votingScheduled = match.votingStatus === "scheduled";
  const hasEnoughPlayers = match.players.length >= 2;
  const voteablePlayers = getVoteablePlayers(match.players, currentPlayerName);
  const hasEnoughVoteablePlayers = voteablePlayers.length >= 2;
  const canVote =
    canUserVote &&
    hasEnoughVoteablePlayers &&
    !alreadyVoted &&
    match.votingStatus === "open";
  const statusConfig = {
    closed: {
      icon: Lock,
      label: "Cerrada",
      variant: "secondary" as const,
    },
    open: {
      icon: Timer,
      label: "Abierta",
      variant: "success" as const,
    },
    scheduled: {
      icon: CalendarDays,
      label: hasEnoughPlayers ? "Próxima" : "Sin jugadores",
      variant: "warning" as const,
    },
  }[match.votingStatus];
  const StatusIcon = statusConfig.icon;

  return (
    <Card
      className={cn(
        "club-animate-fade-up overflow-hidden",
        getCompetitionCardClass(match.sourceType),
      )}
    >
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
            <div className="mt-3 flex flex-wrap gap-2">
              <CompetitionBadge kind={match.sourceType} />
              {match.sourceType !== "friendly" ? (
                <Badge variant="outline">{match.resultLabel}</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusConfig.variant} className="w-fit gap-1.5">
              <StatusIcon className="size-3.5" />
              {statusConfig.label}
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
        {canManage && match.canEdit ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowEditor((current) => !current)}
            >
              <Pencil />
              {showEditor ? "Cerrar edición" : "Editar amistoso"}
            </Button>
          </div>
        ) : null}

        {canManage && match.canEdit && showEditor ? (
          <FriendlyMatchEditForm match={match} onSaved={() => setShowEditor(false)} />
        ) : null}

        <div className="border-border bg-muted/30 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <UsersRound className="text-muted-foreground size-4" />
            <span>{match.players.length} jugadores disponibles para votar</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Timer className="size-3.5" />
            <span>
              {!hasEnoughPlayers
                ? "Esperando jugadores"
                : votingScheduled
                  ? `Abre ${formatDateTime(match.votingStartsAt)}`
                  : `Hasta ${formatDateTime(match.votingEndsAt)}`}{" "}
              · {match.totalVoters} votantes
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
          <PlayerVoteForm match={match} players={voteablePlayers} />
        ) : votingScheduled ? (
          <p className="text-muted-foreground text-sm">
            La votación se habilita automáticamente cuando el partido tiene jugadores
            cargados.
          </p>
        ) : votingClosed ? (
          <p className="text-muted-foreground text-sm">
            La votación de este partido ya cerró. Podés ver cómo quedó el podio.
          </p>
        ) : !canUserVote ? (
          <p className="text-muted-foreground text-sm">
            La votación está disponible solo para usuarios jugadores.
          </p>
        ) : !hasEnoughVoteablePlayers ? (
          <p className="text-muted-foreground text-sm">
            Necesitás tener al menos dos compañeros disponibles para votar.
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
            className={showResults ? "club-animate-select-pop" : undefined}
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

function FriendlyMatchEditForm({
  match,
  onSaved,
}: {
  match: PlayerOfMatchMatch;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<PlayerOfMatchEditFormValues>({
    defaultValues: {
      date: toDateTimeLocalValue(match.date),
      matchId: match.id,
      playersText: match.players.join("\n"),
      rival: match.rival,
      sourceType: "friendly",
    },
    resolver: zodResolver(playerOfMatchEditSchema),
  });

  function onSubmit(values: PlayerOfMatchEditFormValues) {
    setMessage("");
    setSuccess(false);

    startTransition(async () => {
      const result = await updatePlayerOfMatchMatch(values);

      setMessage(result.message);
      setSuccess(result.ok);

      if (result.ok) {
        window.setTimeout(() => {
          onSaved();
          router.refresh();
        }, 500);
      }
    });
  }

  return (
    <form
      className="club-animate-fade-up border-border bg-background grid gap-3 rounded-md border p-3"
      onSubmit={handleSubmit(onSubmit)}
    >
      <LoadingModal open={isPending} description="Guardando amistoso..." />
      <input type="hidden" {...register("matchId")} />
      <input type="hidden" value="friendly" {...register("sourceType")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Fecha y hora</span>
          <input
            type="datetime-local"
            className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            {...register("date")}
          />
          {errors.date?.message ? (
            <span className="text-destructive text-xs">{errors.date.message}</span>
          ) : null}
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Competencia</span>
          <input
            disabled
            value="Amistoso"
            className="border-input bg-muted text-muted-foreground h-10 rounded-md border px-3 text-sm"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm">
        <span className="font-medium">Rival</span>
        <input
          className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
          placeholder="Nombre del rival"
          {...register("rival")}
        />
        {errors.rival?.message ? (
          <span className="text-destructive text-xs">{errors.rival.message}</span>
        ) : null}
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium">Jugadores que participaron</span>
        <textarea
          className="border-input bg-background focus-visible:ring-ring min-h-32 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          placeholder="Un jugador por línea"
          {...register("playersText")}
        />
        {errors.playersText?.message ? (
          <span className="text-destructive text-xs">{errors.playersText.message}</span>
        ) : null}
      </label>

      <Button type="submit" disabled={isPending}>
        <Save />
        Guardar amistoso
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

function ResultsPodium({ match }: { match: PlayerOfMatchMatch }) {
  const podium = match.results.slice(0, 3);
  const totalPoints = match.results.reduce((total, result) => total + result.points, 0);

  return (
    <div className="club-animate-fade-up border-border bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="bg-primary text-primary-foreground relative grid gap-3 p-3 sm:gap-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(0,148,220,0.95),rgba(1,47,119,0.9)_55%,rgba(244,206,15,0.18))]" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold tracking-wide text-[#f4ce0f] uppercase sm:text-xs">
              Podio actual
            </p>
            <h3 className="mt-1 flex items-center gap-2 text-base font-bold sm:text-lg">
              <Trophy className="size-5 text-[#f4ce0f]" />
              MVP vs {match.rival}
            </h3>
          </div>
          <Badge className="shrink-0 border-white/20 bg-white/10 text-white">
            {totalPoints} {totalPoints === 1 ? "punto" : "puntos"}
          </Badge>
        </div>

        <div className="relative z-10 grid grid-cols-3 items-end gap-2 sm:gap-3">
          <PodiumSpot result={podium[1]} place={2} heightClass="h-36 sm:h-44" />
          <PodiumSpot result={podium[0]} place={1} heightClass="h-44 sm:h-56" featured />
          <PodiumSpot result={podium[2]} place={3} heightClass="h-36 sm:h-44" />
        </div>

        {match.results.length === 0 || match.totalVotes === 0 ? (
          <p className="relative z-10 rounded-md border border-white/15 bg-white/10 p-2 text-xs text-white/80 sm:p-3 sm:text-sm">
            Todavía no hay votos cargados para este partido.
          </p>
        ) : (
          <div className="relative z-10 hidden gap-2 rounded-md border border-white/15 bg-white/10 p-3 sm:grid">
            {match.results.slice(0, 6).map((result, index) => (
              <div
                key={result.playerName}
                style={
                  {
                    "--club-list-delay": `${Math.min(index, 6) * 45}ms`,
                  } as CSSProperties
                }
                className="club-animate-list-in flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  #{result.rank} {result.playerName}
                </span>
                <span className="font-semibold text-[#f4ce0f]">
                  {formatResultScore(result)}
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
    1: "border-[#f4ce0f]/60 bg-[#f4ce0f] text-[#012f77] shadow-[0_14px_30px_rgba(244,206,15,0.24)]",
    2: "border-white/70 bg-white/90 text-[#012f77]",
    3: "border-[#c10202]/50 bg-[#c10202] text-white",
  };
  const delays = {
    1: "90ms",
    2: "0ms",
    3: "150ms",
  };

  return (
    <div
      style={{ "--club-rise-delay": delays[place] } as CSSProperties}
      className={cn(
        "club-animate-podium-rise flex min-w-0 flex-col items-center justify-between rounded-md border p-2 text-center shadow-lg sm:p-3",
        heightClass,
        colors[place],
        featured && "ring-2 ring-white/80",
      )}
    >
      <div>
        {place === 1 ? (
          <Crown className="club-animate-pop-in mx-auto mb-0.5 size-5 sm:mb-1 sm:size-6" />
        ) : (
          <Medal className="club-animate-pop-in mx-auto mb-0.5 size-4 sm:mb-1 sm:size-5" />
        )}
        <p className="text-[0.65rem] font-bold uppercase sm:text-xs">Puesto {place}</p>
      </div>
      <PlayerAvatar
        className={
          featured
            ? "size-14 border-[3px] sm:size-20 sm:border-4"
            : "size-12 border-2 sm:size-16"
        }
        fit="contain"
        name={result?.playerName ?? "-"}
        photoDataUrl={result?.photoDataUrl}
      />
      <div className="min-w-0">
        <p className="line-clamp-2 min-h-8 text-xs leading-tight font-bold sm:min-h-10 sm:text-sm">
          {result?.playerName ?? "Sin votos"}
        </p>
        <p className="mt-1 text-[0.65rem] font-semibold opacity-80 sm:text-xs">
          {result ? formatResultScore(result) : "-"}
        </p>
      </div>
    </div>
  );
}

function PlayerAvatar({
  className,
  fit = "cover",
  name,
  photoDataUrl,
}: {
  className: string;
  fit?: "contain" | "cover";
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
          className={cn(
            "size-full",
            fit === "contain" ? "object-contain p-1" : "object-cover",
          )}
        />
      ) : (
        <span className="text-lg font-black">{getInitials(name)}</span>
      )}
    </div>
  );
}

function PlayerVoteForm({
  match,
  players,
}: {
  match: PlayerOfMatchMatch;
  players: string[];
}) {
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
        window.setTimeout(() => router.refresh(), 650);
      }
    });
  }

  return (
    <form
      className={cn("relative grid gap-4", success ? "club-vote-success" : undefined)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <LoadingModal open={isPending} description="Guardando voto..." />
      <input type="hidden" {...register("matchId")} />
      <div className="border-border bg-primary/5 text-primary rounded-md border p-3 text-sm">
        <p className="font-semibold">Cómo suma tu voto</p>
        <p className="mt-1 text-xs leading-relaxed">
          Tu primer voto vale 2 puntos. Tu segundo voto vale 1 punto. Elegí dos compañeros
          del partido; tu propio nombre no participa de tus opciones.
        </p>
      </div>
      <VoteSelect
        disabledOption={secondVote}
        error={errors.firstVotePlayerName?.message}
        label="Primer voto"
        players={players}
        registration={register("firstVotePlayerName")}
        selected={Boolean(firstVote)}
      />
      <VoteSelect
        disabledOption={firstVote}
        error={errors.secondVotePlayerName?.message}
        label="Segundo voto"
        players={players}
        registration={register("secondVotePlayerName")}
        selected={Boolean(secondVote)}
      />
      <Button
        type="submit"
        disabled={isPending}
        className={success ? "club-animate-select-pop" : undefined}
      >
        <Trophy />
        Votar MVP
      </Button>
      {message ? (
        <p
          className={`club-animate-fade-up flex items-center gap-2 text-sm font-medium ${
            success ? "text-primary" : "text-destructive"
          }`}
        >
          {success ? <Sparkles className="size-4" aria-hidden="true" /> : null}
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
  selected,
}: {
  disabledOption?: string;
  error?: string;
  label: string;
  players: string[];
  registration: UseFormRegisterReturn;
  selected: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="flex items-center gap-2 font-medium">
        {label}
        {selected ? (
          <CheckCircle2
            className="club-animate-pop-in text-primary size-4"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <select
        className={cn(
          "border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm transition-[border-color,background-color,box-shadow] outline-none focus-visible:ring-2",
          selected
            ? "club-animate-select-pop border-primary bg-primary/5 shadow-sm"
            : undefined,
        )}
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

function TableHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-muted-foreground h-11 px-2 text-left align-middle font-medium sm:px-4",
        className,
      )}
    >
      {children}
    </th>
  );
}

function formatDate(value: string) {
  const hasTime = value.includes("T") || value.includes(" ");
  const date = parseMatchDate(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: hasTime ? "2-digit" : undefined,
    minute: hasTime ? "2-digit" : undefined,
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(date);
}

function isCurrentPlayerOfMatch(match: PlayerOfMatchMatch) {
  return (
    match.players.length >= 2 &&
    match.votingStatus === "open" &&
    isMatchDateReached(match.date)
  );
}

function isHistoryPlayerOfMatch(match: PlayerOfMatchMatch) {
  return (
    isMatchDateReached(match.date) &&
    (match.votingStatus === "closed" || Boolean(match.userVote) || match.totalVotes > 0)
  );
}

function isMatchDateReached(value: string) {
  const date = parseMatchDate(value);

  return !date || date.getTime() <= Date.now();
}

function parseMatchDate(value: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.includes("T")
    ? value
    : value.includes(" ")
      ? value.replace(" ", "T")
      : `${value}T00:00:00-03:00`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateTimeLocalValue(value: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 16);
  }

  return `${value.slice(0, 10)}T00:00`;
}

function formatDateTime(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function formatResultScore(result: PlayerOfMatchResult) {
  const pointsLabel = result.points === 1 ? "punto" : "puntos";
  const votesLabel = result.votes === 1 ? "voto" : "votos";

  return `${result.points} ${pointsLabel} (${result.votes} ${votesLabel})`;
}

function getVoteablePlayers(players: string[], currentPlayerName?: string) {
  const currentPlayerKey = normalizeValue(currentPlayerName);

  if (!currentPlayerKey) {
    return players;
  }

  return players.filter((player) => normalizeValue(player) !== currentPlayerKey);
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
