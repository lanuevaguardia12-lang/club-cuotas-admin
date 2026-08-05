import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListChecks,
  Table2,
  Trophy,
  UsersRound,
} from "lucide-react";

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
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" method="GET">
          <label className="grid gap-2 text-sm font-medium">
            <span className="text-muted-foreground text-xs font-semibold uppercase">
              Competencia
            </span>
            <select
              name="competition"
              defaultValue={data.selectedCompetitionKey}
              className="border-input bg-background focus:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus:ring-2"
            >
              {data.tournaments.map((tournament) => (
                <optgroup key={tournament.id} label={tournament.name}>
                  {tournament.categories.map((category) => (
                    <option
                      key={`${tournament.id}:${category.id}`}
                      value={`${tournament.id}:${category.id}`}
                    >
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button className="w-full sm:w-auto">
              <ListChecks />
              Ver
            </Button>
          </div>
        </form>

        <div className="border-border mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
          <InfoPill label="Torneo" value={data.selectedTournamentName} />
          <InfoPill label="Categoria" value={data.selectedCategoryName} />
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
          <div className="border-border overflow-x-auto rounded-md border">
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
        ) : (
          <EmptyInline title="Sin tabla" detail="La liga no devolvio posiciones." />
        )}
      </CardContent>
    </Card>
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
        "border-border grid gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center",
        match.isClubMatch ? "bg-secondary/50" : "bg-card",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Clock3 className="size-4" />
        {match.time || "-"}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-2">
        <TeamName name={match.localTeam} align="right" />
        <MatchScore match={match} />
        <TeamName name={match.visitorTeam} />
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
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
    <div className="border-border bg-background grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <CalendarDays className="size-3.5" />
          <span>
            {match.round}
            {match.roundDate ? ` · ${match.roundDate}` : ""}
            {match.time ? ` · ${match.time}` : ""}
          </span>
        </div>
        <StatusBadge status={match.status} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
        <TeamName name={match.localTeam} align="right" />
        <MatchScore match={match} />
        <TeamName name={match.visitorTeam} />
      </div>
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
