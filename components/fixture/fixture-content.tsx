import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Table2,
  Trophy,
  UsersRound,
} from "lucide-react";

import {
  CompetitionBadge,
  getCompetitionCardClass,
} from "@/components/fixture/competition-badge";
import { FixtureFilters } from "@/components/fixture/fixture-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TEAM_NAME } from "@/lib/league-fixture";
import { cn } from "@/lib/utils";
import type {
  LeagueFixtureData,
  LeagueFixtureMatch,
  LeagueFixtureRound,
  LeagueMatchStatus,
  LeagueStandingRow,
} from "@/types/fixture";

interface FixtureContentProps {
  data: LeagueFixtureData;
}

export function FixtureContent({ data }: FixtureContentProps) {
  const hasPublishedResults = data.matches.some((match) => match.status === "played");

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <CompetitionSelector data={data} />
        <ClubSnapshot data={data} />
      </section>

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}

      {!hasPublishedResults && data.matches.length > 0 ? (
        <section className="border-border bg-card flex gap-3 rounded-lg border p-4 text-sm">
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">
            La liga no esta publicando resultados por partido para esta categoria. La
            tabla puede estar actualizada aunque las tarjetas del fixture figuren sin
            resultado.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <StandingsTable data={data} />
        <ClubMatches matches={data.clubMatches} />
      </section>

      <FixtureRounds rounds={data.rounds} />
    </div>
  );
}

function CompetitionSelector({ data }: FixtureContentProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="text-primary size-5" />
            Torneo
          </CardTitle>
          <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
            {data.source.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <FixtureFilters
          availableYears={data.availableYears}
          selectedCompetitionKey={data.selectedCompetitionKey}
          selectedYear={data.selectedYear}
          tournaments={data.tournaments}
        />

        <div className="border-border mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
          <InfoPill label="Torneo" value={data.selectedTournamentName} />
          <InfoPill label="Categoria" value={data.selectedCategoryName} />
        </div>
        <div className="mt-3">
          <CompetitionBadge kind={data.selectedCompetitionKind} />
        </div>
      </CardContent>
    </Card>
  );
}

function ClubSnapshot({ data }: FixtureContentProps) {
  const nextMatch = data.nextMatches[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary text-primary-foreground">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-5" />
          {APP_TEAM_NAME}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <MetricBox
            label="Posicion"
            value={data.clubStanding ? `#${data.clubStanding.position}` : "-"}
          />
          <MetricBox
            label="Puntos"
            value={data.clubStanding ? String(data.clubStanding.points) : "-"}
          />
        </div>

        <div className="border-border grid gap-2 border-t pt-4">
          <p className="text-muted-foreground text-xs font-semibold uppercase">
            Siguiente
          </p>
          {nextMatch ? (
            <CompactMatch match={nextMatch} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay proximo partido publicado para el equipo.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StandingsTable({ data }: FixtureContentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Table2 className="text-primary size-5" />
          Tabla de posiciones
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.standings.length > 0 ? (
          <>
            <StandingsMobileCards rows={data.standings} />
            <div className="border-border hidden overflow-x-auto rounded-md border md:block">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Equipo</th>
                    <th className="px-3 py-2 text-center font-semibold">J</th>
                    <th className="px-3 py-2 text-center font-semibold">G</th>
                    <th className="px-3 py-2 text-center font-semibold">E</th>
                    <th className="px-3 py-2 text-center font-semibold">P</th>
                    <th className="px-3 py-2 text-center font-semibold">GF</th>
                    <th className="px-3 py-2 text-center font-semibold">GC</th>
                    <th className="px-3 py-2 text-center font-semibold">Dif</th>
                    <th className="px-3 py-2 text-center font-semibold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((row) => (
                    <tr
                      key={`${row.position}-${row.teamName}`}
                      className={cn(
                        "border-border border-t",
                        row.isClub ? "bg-secondary/80 font-semibold" : "bg-card",
                      )}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-grid size-7 place-items-center rounded-md text-xs font-bold",
                            row.isClub
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.position}
                        </span>
                      </td>
                      <td className="px-3 py-2">{row.teamName}</td>
                      <td className="px-3 py-2 text-center">{row.played}</td>
                      <td className="px-3 py-2 text-center">{row.won}</td>
                      <td className="px-3 py-2 text-center">{row.drawn}</td>
                      <td className="px-3 py-2 text-center">{row.lost}</td>
                      <td className="px-3 py-2 text-center">{row.goalsFor}</td>
                      <td className="px-3 py-2 text-center">{row.goalsAgainst}</td>
                      <td className="px-3 py-2 text-center">
                        {row.goalDifference > 0
                          ? `+${row.goalDifference}`
                          : row.goalDifference}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyInline title="Sin tabla" detail="La liga no devolvio posiciones." />
        )}
      </CardContent>
    </Card>
  );
}

function StandingsMobileCards({ rows }: { rows: LeagueStandingRow[] }) {
  return (
    <div className="grid gap-2 md:hidden">
      {rows.map((row) => (
        <article
          key={`${row.position}-${row.teamName}`}
          className={cn(
            "border-border bg-background rounded-md border p-3",
            row.isClub && "border-primary/30 bg-secondary/80",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold",
                  row.isClub && "bg-primary text-primary-foreground",
                )}
              >
                {row.position}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{row.teamName}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {row.played} PJ · {row.won}G {row.drawn}E {row.lost}P
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">{row.points}</p>
              <p className="text-muted-foreground text-xs">pts</p>
            </div>
          </div>
          <div className="text-muted-foreground mt-3 grid grid-cols-3 gap-2 text-xs">
            <StatPill label="GF" value={row.goalsFor} />
            <StatPill label="GC" value={row.goalsAgainst} />
            <StatPill
              label="Dif"
              value={
                row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference
              }
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function ClubMatches({ matches }: { matches: LeagueFixtureMatch[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="text-primary size-5" />
          Partidos del equipo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length > 0 ? (
          <div className="grid gap-3">
            {matches.map((match) => (
              <CompactMatch key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <EmptyInline
            title="Sin partidos"
            detail="No hay tarjetas publicadas para La Nueva Guardia."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FixtureRounds({ rounds }: { rounds: LeagueFixtureRound[] }) {
  return (
    <section className="grid gap-4">
      <div>
        <p className="text-muted-foreground text-sm font-medium">Fixture completo</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal">Fechas del torneo</h2>
      </div>

      {rounds.length > 0 ? (
        <div className="grid gap-3">
          {rounds.map((round, index) => (
            <details
              key={`${round.name}-${round.date}`}
              open={index === 0}
              className="border-border bg-card group rounded-lg border"
            >
              <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 transition-colors">
                <span>
                  <span className="font-semibold">{round.name}</span>
                  {round.date ? (
                    <span className="text-muted-foreground ml-2 text-sm">
                      {round.date}
                    </span>
                  ) : null}
                </span>
                <Badge variant="outline">{round.matches.length} partidos</Badge>
              </summary>
              <div className="border-border grid gap-0 border-t">
                {round.matches.map((match) => (
                  <FullMatchRow key={match.id} match={match} />
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <EmptyInline title="Sin fixture" detail="La liga no devolvio partidos." />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function FullMatchRow({ match }: { match: LeagueFixtureMatch }) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center",
        match.isClubMatch
          ? getCompetitionCardClass(match.competitionKind)
          : "border-border bg-card",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Clock3 className="size-4" />
        {match.time || "-"}
      </div>

      <MatchTeamsCard match={match} />

      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-2 md:grid">
        <TeamName name={match.localTeam} align="right" />
        <MatchScore match={match} />
        <TeamName name={match.visitorTeam} />
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <CompetitionBadge kind={match.competitionKind} />
        <StatusBadge status={match.status} />
        {match.detailUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={match.detailUrl} rel="noreferrer" target="_blank">
              <ExternalLink />
              Detalle
            </a>
          </Button>
        ) : null}
      </div>

      {match.goals.length > 0 || match.cards.length > 0 ? (
        <div className="text-muted-foreground grid gap-1 text-xs md:col-span-3">
          {match.goals.length > 0 ? <p>Goles: {match.goals.join(", ")}</p> : null}
          {match.cards.length > 0 ? <p>Tarjetas: {match.cards.join(", ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function CompactMatch({ match }: { match: LeagueFixtureMatch }) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-md border p-3",
        getCompetitionCardClass(match.competitionKind),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <CalendarDays className="size-3.5" />
          <span>
            {match.round}
            {match.roundDate ? ` · ${match.roundDate}` : ""}
            {match.time ? ` · ${match.time}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CompetitionBadge kind={match.competitionKind} />
          <StatusBadge status={match.status} />
        </div>
      </div>
      <MatchTeamsCard className="md:grid" match={match} />
    </div>
  );
}

function MatchTeamsCard({
  className,
  match,
}: {
  className?: string;
  match: LeagueFixtureMatch;
}) {
  return (
    <div className={cn("grid gap-2 md:hidden", className)}>
      <MatchTeamLine
        label="Local"
        score={match.localScore}
        showScore={match.status === "played"}
        teamName={match.localTeam}
      />
      <div className="text-muted-foreground flex items-center justify-center">
        <MatchScore match={match} />
      </div>
      <MatchTeamLine
        label="Visita"
        score={match.visitorScore}
        showScore={match.status === "played"}
        teamName={match.visitorTeam}
      />
    </div>
  );
}

function MatchTeamLine({
  label,
  score,
  showScore,
  teamName,
}: {
  label: string;
  score?: number;
  showScore: boolean;
  teamName: string;
}) {
  const isClub = teamName === APP_TEAM_NAME;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
        isClub ? "bg-primary text-primary-foreground" : "bg-muted/60",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{teamName}</p>
        <p className="text-xs opacity-75">{label}</p>
      </div>
      {showScore ? (
        <span className="text-xl font-bold tracking-normal">{score ?? 0}</span>
      ) : null}
    </div>
  );
}

function MatchScore({ match }: { match: LeagueFixtureMatch }) {
  const label =
    match.status === "played" &&
    typeof match.localScore === "number" &&
    typeof match.visitorScore === "number"
      ? `${match.localScore}-${match.visitorScore}`
      : match.status === "without-result"
        ? "S/R"
        : "vs";

  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-md px-2 text-sm font-bold",
        match.status === "played" && "bg-primary text-primary-foreground",
        match.status === "without-result" && "bg-accent text-accent-foreground",
      )}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: LeagueMatchStatus }) {
  const config = {
    pending: {
      label: "Pendiente",
      icon: Clock3,
      variant: "secondary" as const,
    },
    played: {
      label: "Finalizado",
      icon: CheckCircle2,
      variant: "success" as const,
    },
    "without-result": {
      label: "Sin resultado",
      icon: AlertTriangle,
      variant: "warning" as const,
    },
  }[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="w-fit gap-1.5">
      <Icon className="size-3.5" />
      {config.label}
    </Badge>
  );
}

function TeamName({ align = "left", name }: { align?: "left" | "right"; name: string }) {
  const isClub = name === APP_TEAM_NAME;

  return (
    <span
      className={cn(
        "min-w-0 truncate",
        align === "right" ? "text-right" : "text-left",
        isClub && "text-primary font-semibold",
      )}
      title={name}
    >
      {name}
    </span>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md p-3">
      <p className="text-muted-foreground text-xs font-semibold uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-normal">{value}</p>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-muted/70 rounded-md px-2 py-1 text-center">
      <p className="text-foreground font-semibold">{value}</p>
      <p>{label}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs font-semibold uppercase">{label}</p>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function EmptyInline({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="text-center">
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
    </div>
  );
}
