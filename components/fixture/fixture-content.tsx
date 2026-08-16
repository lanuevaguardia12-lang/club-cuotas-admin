import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Table2,
  Trophy,
} from "lucide-react";

import {
  CompetitionBadge,
  getCompetitionCardClass,
} from "@/components/fixture/competition-badge";
import { FixtureMatchScheduleEditor } from "@/components/fixture/fixture-match-schedule-editor";
import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationLink } from "@/components/ui/navigation-link";
import { APP_TEAM_NAME } from "@/lib/league-fixture";
import { cn } from "@/lib/utils";
import type {
  FixturePlayerOption,
  LeagueFixtureData,
  LeagueFixtureMatch,
  LeagueFixtureRound,
  LeagueMatchStatus,
  LeagueScorerRow,
  LeagueStandingRow,
} from "@/types/fixture";

interface FixtureContentProps {
  activeTab?: string;
  canManage?: boolean;
  data: LeagueFixtureData;
  playerOptions?: FixturePlayerOption[];
  selectedRoundKeys?: string[];
}

type FixtureTab = "resumen" | "posiciones" | "goleadores" | "fixture";

export function FixtureContent({
  activeTab,
  canManage = false,
  data,
  playerOptions = [],
  selectedRoundKeys = [],
}: FixtureContentProps) {
  const tab = normalizeFixtureTab(activeTab);
  const hasPublishedResults = data.matches.some((match) => match.status === "played");

  return (
    <div className={cn("grid min-w-0", tab === "posiciones" ? "gap-3" : "gap-6")}>
      <FixtureTabNav data={data} activeTab={tab} />

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}

      {!hasPublishedResults && data.matches.length > 0 ? (
        <section className="border-border bg-card flex min-w-0 gap-3 rounded-lg border p-4 text-sm">
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground min-w-0 break-words">
            La liga no esta publicando resultados por partido para esta categoria. La
            tabla puede estar actualizada aunque las tarjetas del fixture figuren sin
            resultado.
          </p>
        </section>
      ) : null}

      {tab === "resumen" ? <SummaryTab data={data} /> : null}
      {tab === "posiciones" ? <StandingsTable data={data} /> : null}
      {tab === "goleadores" ? <ScorersTable rows={data.scorers} /> : null}
      {tab === "fixture" ? (
        <FixtureRounds
          canManage={canManage}
          data={data}
          playerOptions={playerOptions}
          rounds={data.rounds}
          selectedRoundKeys={selectedRoundKeys}
        />
      ) : null}
    </div>
  );
}

function FixtureTabNav({
  activeTab,
  data,
}: {
  activeTab: FixtureTab;
  data: LeagueFixtureData;
}) {
  const tabs: Array<{ label: string; value: FixtureTab }> = [
    { label: "Resumen", value: "resumen" },
    { label: "Posiciones", value: "posiciones" },
    { label: "Fixture", value: "fixture" },
    { label: "Goleadores", value: "goleadores" },
  ];

  return (
    <nav className="border-border bg-card flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-lg border p-1">
      {tabs.map((tab) => (
        <NavigationLink
          key={tab.value}
          href={buildFixtureHref(data, tab.value)}
          loadingMessage={`Cargando ${tab.label}...`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            activeTab === tab.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </NavigationLink>
      ))}
    </nav>
  );
}

function SummaryTab({ data }: FixtureContentProps) {
  const nextMatch =
    data.nextMatches[0] ?? data.clubMatches.find((match) => match.status === "pending");
  const lastMatch =
    data.lastMatches[0] ??
    [...data.clubMatches].reverse().find((match) => match.status === "played");

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        <CardHeader className="bg-primary text-primary-foreground">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-5" />
            Resumen del torneo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MetricBox
              label="Posición"
              value={data.clubStanding ? `#${data.clubStanding.position}` : "-"}
            />
            <MetricBox
              label="Ganados"
              value={data.clubStanding ? String(data.clubStanding.won) : "-"}
            />
            <MetricBox
              label="Empatados"
              value={data.clubStanding ? String(data.clubStanding.drawn) : "-"}
            />
            <MetricBox
              label="Perdidos"
              value={data.clubStanding ? String(data.clubStanding.lost) : "-"}
            />
            <MetricBox
              label="Goles a favor"
              value={data.clubStanding ? String(data.clubStanding.goalsFor) : "-"}
            />
            <MetricBox
              label="Goles en contra"
              value={data.clubStanding ? String(data.clubStanding.goalsAgainst) : "-"}
            />
          </div>

          <div className="border-border grid gap-3 border-t pt-4">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Próximo partido
            </p>
            {nextMatch ? (
              <NextMatchCard
                match={nextMatch}
                matches={data.matches}
                rows={data.standings}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No hay próximo partido publicado para el equipo.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="text-primary size-5" />
            Último partido
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastMatch ? (
            <PlayedMatchCard match={lastMatch} rows={data.standings} />
          ) : (
            <EmptyInline
              title="Sin partidos jugados"
              detail="Todavía no hay resultados publicados para el equipo."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function NextMatchCard({
  match,
  matches,
  rows,
}: {
  match: LeagueFixtureMatch;
  matches: LeagueFixtureMatch[];
  rows: LeagueStandingRow[];
}) {
  const showPositions = match.competitionKind === "league";
  const localPosition = showPositions
    ? getTeamPositionLabel(rows, match.localTeam)
    : undefined;
  const visitorPosition = showPositions
    ? getTeamPositionLabel(rows, match.visitorTeam)
    : undefined;

  return (
    <div
      className={cn(
        "grid gap-4 rounded-md border p-3",
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

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <PositionTeamLine
          align="right"
          position={localPosition}
          teamName={match.localTeam}
        />
        <div className="flex justify-center">
          <MatchScore match={match} />
        </div>
        <PositionTeamLine position={visitorPosition} teamName={match.visitorTeam} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TeamRecentForm
          teamName={match.localTeam}
          matches={matches}
          beforeMatch={match}
        />
        <TeamRecentForm
          teamName={match.visitorTeam}
          matches={matches}
          beforeMatch={match}
        />
      </div>
      <MatchGoalsList match={match} />
    </div>
  );
}

function PositionTeamLine({
  align = "left",
  position,
  teamName,
}: {
  align?: "left" | "right";
  position?: string;
  teamName: string;
}) {
  const isClub = teamName === APP_TEAM_NAME;

  return (
    <div
      className={cn(
        "min-w-0 rounded-md px-3 py-2",
        align === "right" ? "text-right" : "text-left",
        isClub ? "bg-primary text-primary-foreground" : "bg-muted/60",
      )}
    >
      <div
        className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}
      >
        <TeamAvatar teamName={teamName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{teamName}</p>
          {position ? <p className="mt-1 text-xs opacity-75">{position}</p> : null}
        </div>
      </div>
    </div>
  );
}

function TeamRecentForm({
  beforeMatch,
  matches,
  teamName,
}: {
  beforeMatch: LeagueFixtureMatch;
  matches: LeagueFixtureMatch[];
  teamName: string;
}) {
  const recentMatches = getLastPlayedMatchesForTeam(matches, teamName, beforeMatch).slice(
    0,
    3,
  );

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs font-semibold uppercase">
        Últimos de {teamName}
      </p>
      {recentMatches.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {recentMatches.map((recentMatch) => {
            const outcome = getTeamMatchOutcome(recentMatch, teamName);

            return (
              <span
                key={recentMatch.id}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-semibold",
                  getOutcomeClassName(outcome.kind),
                )}
              >
                {outcome.label} vs {outcome.rival}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No hay partidos anteriores.</p>
      )}
    </div>
  );
}

function PlayedMatchCard({
  match,
  rows,
}: {
  match: LeagueFixtureMatch;
  rows: LeagueStandingRow[];
}) {
  const showPositions = match.competitionKind === "league";
  const localPosition = showPositions
    ? getTeamPositionLabel(rows, match.localTeam)
    : undefined;
  const visitorPosition = showPositions
    ? getTeamPositionLabel(rows, match.visitorTeam)
    : undefined;

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
      <div className="grid gap-2">
        <PositionTeamLine position={localPosition} teamName={match.localTeam} />
        <div className="flex justify-center">
          <MatchScore match={match} />
        </div>
        <PositionTeamLine position={visitorPosition} teamName={match.visitorTeam} />
      </div>
      <MatchGoalsList match={match} />
    </div>
  );
}

function StandingsTable({ data }: FixtureContentProps) {
  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="text-primary size-4" />
          Tabla de posiciones
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.standings.length > 0 ? (
          <div className="grid gap-2">
            <UnifiedStandingsTable matches={data.matches} rows={data.standings} />
            <StandingsLegend />
          </div>
        ) : (
          <EmptyInline title="Sin tabla" detail="La liga no devolvio posiciones." />
        )}
      </CardContent>
    </Card>
  );
}

function ScorersTable({ rows }: { rows: LeagueScorerRow[] }) {
  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="text-primary size-4" />
          Tabla de goleadores
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length > 0 ? (
          <div className="border-border max-h-[72dvh] overflow-y-auto border-t">
            <table className="w-full table-fixed text-xs sm:text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-2 py-2 text-left font-semibold">#</th>
                  <th className="px-2 py-2 text-left font-semibold">Jugador</th>
                  <th className="px-2 py-2 text-left font-semibold">Club</th>
                  <th className="w-16 px-2 py-2 text-center font-semibold">Goles</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.playerName}-${row.teamName}`}
                    className="border-border border-t"
                  >
                    <td className="px-2 py-2 font-bold">{index + 1}</td>
                    <td className="px-2 py-2">
                      <span className="line-clamp-2 font-semibold">{row.playerName}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="line-clamp-2">{row.teamName}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-base font-bold">
                      {row.goals}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyInline
              title="Sin goleadores"
              detail="La liga todavia no publico detalle de goles para esta competencia."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnifiedStandingsTable({
  matches,
  rows,
}: {
  matches: LeagueFixtureMatch[];
  rows: LeagueStandingRow[];
}) {
  return (
    <div className="border-border max-h-[72dvh] overflow-y-auto border-t">
      <table className="w-full table-fixed text-[0.68rem] leading-tight sm:text-sm">
        <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
          <tr>
            <th className="w-7 px-1 py-1.5 text-left font-semibold sm:w-10">#</th>
            <th className="px-1 py-1.5 text-left font-semibold">Equipo</th>
            <th className="w-9 px-1 py-1.5 text-center text-[0.6rem] font-semibold sm:w-16 sm:text-sm">
              Puntos
            </th>
            <th className="w-10 px-1 py-1.5 text-center font-semibold sm:w-14">VS</th>
            <th className="w-7 px-1 py-1.5 text-center font-semibold sm:w-12">PJ</th>
            <th className="w-7 px-1 py-1.5 text-center font-semibold sm:w-10">G</th>
            <th className="w-7 px-1 py-1.5 text-center font-semibold sm:w-10">E</th>
            <th className="w-7 px-1 py-1.5 text-center font-semibold sm:w-10">P</th>
            <th className="w-8 px-1 py-1.5 text-center font-semibold sm:w-12">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const versus = getVersusClubResult(matches, row.teamName);

            return (
              <tr
                key={`${row.position}-${row.teamName}`}
                className={cn(
                  "border-border border-t",
                  getPositionRowClassName(row.position),
                  row.isClub && "font-semibold",
                )}
              >
                <td className="px-1 py-1.5">
                  <span
                    className={cn(
                      "inline-grid size-5 place-items-center rounded-sm text-[0.65rem] font-bold sm:size-7 sm:rounded-md sm:text-xs",
                      getPositionBadgeClassName(row.position),
                    )}
                  >
                    {row.position}
                  </span>
                </td>
                <td className="px-1 py-1.5" title={row.teamName}>
                  <span className="line-clamp-2 break-words sm:line-clamp-1">
                    {row.teamName}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-center font-bold">{row.points}</td>
                <td className="px-1 py-1.5 text-center">
                  {row.isClub ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex min-w-8 justify-center rounded-sm px-1 py-0.5 text-[0.58rem] font-bold sm:min-w-9 sm:rounded-md sm:text-[0.68rem]",
                        getOutcomeClassName(versus.kind),
                      )}
                    >
                      {versus.label}
                    </span>
                  )}
                </td>
                <td className="px-1 py-1.5 text-center">{row.played}</td>
                <td className="px-1 py-1.5 text-center">{row.won}</td>
                <td className="px-1 py-1.5 text-center">{row.drawn}</td>
                <td className="px-1 py-1.5 text-center">{row.lost}</td>
                <td className="px-1 py-1.5 text-center">
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StandingsLegend() {
  return (
    <div className="text-muted-foreground flex flex-wrap gap-1.5 px-3 pb-3 text-[0.65rem] sm:text-xs">
      <LegendPill className="bg-amber-100 text-amber-900" label="1° Campeón" />
      <LegendPill className="bg-sky-100 text-sky-900" label="2° Ascenso" />
      <LegendPill className="bg-violet-100 text-violet-900" label="3°/4° Promoción" />
    </div>
  );
}

function FixtureRounds({
  canManage,
  data,
  playerOptions,
  rounds,
  selectedRoundKeys,
}: {
  canManage: boolean;
  data: LeagueFixtureData;
  playerOptions: FixturePlayerOption[];
  rounds: LeagueFixtureRound[];
  selectedRoundKeys: string[];
}) {
  const visibleRoundKeys = new Set(selectedRoundKeys);
  const filteredRounds =
    visibleRoundKeys.size > 0
      ? rounds.filter((round) => visibleRoundKeys.has(getRoundKey(round)))
      : rounds;

  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <p className="text-muted-foreground text-sm font-medium">Fixture completo</p>
        <h2 className="mt-1 text-xl font-semibold tracking-normal">Fechas del torneo</h2>
      </div>

      {rounds.length > 0 ? (
        <div className="grid min-w-0 gap-3">
          <form
            className="border-border bg-card min-w-0 rounded-md border p-2"
            method="GET"
          >
            <input name="competition" type="hidden" value={data.selectedCompetitionKey} />
            <input name="year" type="hidden" value={data.selectedYear} />
            <input name="tab" type="hidden" value="fixture" />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Jornadas</p>
              <Button className="h-8" size="sm">
                <Table2 />
                Aplicar
              </Button>
            </div>
            <div className="-mx-2 mt-2 flex max-w-full min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-2 pb-1 [&::-webkit-scrollbar]:hidden">
              {rounds.map((round) => {
                const roundKey = getRoundKey(round);
                const checked =
                  visibleRoundKeys.size === 0 || visibleRoundKeys.has(roundKey);

                return (
                  <label
                    key={roundKey}
                    className={cn(
                      "border-border bg-background flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                      checked && "border-primary/40 bg-primary/5 text-primary",
                    )}
                  >
                    <input
                      defaultChecked={checked}
                      name="round"
                      type="checkbox"
                      value={roundKey}
                    />
                    {round.name}
                  </label>
                );
              })}
            </div>
          </form>

          {filteredRounds.map((round, index) => (
            <details
              key={`${round.name}-${round.date}`}
              open={index === 0}
              className="border-border bg-card group min-w-0 overflow-hidden rounded-lg border"
            >
              <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors sm:px-4">
                <span className="min-w-0">
                  <span className="font-semibold">{round.name}</span>
                  {round.date ? (
                    <span className="text-muted-foreground ml-2 text-sm">
                      {round.date}
                    </span>
                  ) : null}
                </span>
                <Badge className="shrink-0" variant="outline">
                  {round.matches.length} partidos
                </Badge>
              </summary>
              <div className="border-border grid min-w-0 gap-0 border-t">
                {round.matches.map((match) => (
                  <FullMatchRow
                    key={match.id}
                    canManage={canManage}
                    match={match}
                    playerOptions={playerOptions}
                  />
                ))}
              </div>
            </details>
          ))}
          {filteredRounds.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6">
                <EmptyInline
                  title="Sin jornadas seleccionadas"
                  detail="Marcá al menos una fecha para ver partidos."
                />
              </CardContent>
            </Card>
          ) : null}
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

function FullMatchRow({
  canManage,
  match,
  playerOptions,
}: {
  canManage: boolean;
  match: LeagueFixtureMatch;
  playerOptions: FixturePlayerOption[];
}) {
  const canEditSchedule = canManage && match.isClubMatch;

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 overflow-hidden border-b px-3 py-3 last:border-b-0 sm:px-4 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center",
        match.isClubMatch
          ? getCompetitionCardClass(match.competitionKind)
          : "border-border bg-card",
      )}
    >
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
        <Clock3 className="size-4" />
        {match.time || "-"}
      </div>

      <MatchTeamsCard match={match} />

      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-2 md:grid">
        <TeamName name={match.localTeam} align="right" />
        <MatchScore match={match} />
        <TeamName name={match.visitorTeam} />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
        <CompetitionBadge kind={match.competitionKind} />
        <StatusBadge status={match.status} />
        {match.scheduleOverrideUpdatedAt ? (
          <Badge variant="outline">Editado</Badge>
        ) : null}
        {match.resultOverrideUpdatedAt ? (
          <Badge variant="secondary">Datos LNG</Badge>
        ) : null}
        {match.detailUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={match.detailUrl} rel="noreferrer" target="_blank">
              <ExternalLink />
              Detalle
            </a>
          </Button>
        ) : null}
      </div>

      {canEditSchedule ? (
        <div className="md:col-span-3">
          <FixtureMatchScheduleEditor match={match} playerOptions={playerOptions} />
        </div>
      ) : null}

      {match.goals.length > 0 || match.cards.length > 0 ? (
        <div className="text-muted-foreground grid gap-1 text-xs md:col-span-3">
          {match.goals.length > 0 ? <p>Goles: {match.goals.join(", ")}</p> : null}
          {match.cards.length > 0 ? <p>Tarjetas: {match.cards.join(", ")}</p> : null}
        </div>
      ) : null}
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
    <div className={cn("grid min-w-0 gap-2 md:hidden", className)}>
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
        "flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-md px-3 py-2 text-sm",
        isClub ? "bg-primary text-primary-foreground" : "bg-muted/60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TeamAvatar teamName={teamName} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{teamName}</p>
          <p className="text-xs opacity-75">{label}</p>
        </div>
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

function MatchGoalsList({ match }: { match: LeagueFixtureMatch }) {
  if (match.goals.length === 0) {
    return null;
  }

  return (
    <div className="bg-muted/60 rounded-md px-3 py-2 text-xs">
      <p className="font-semibold">Goles</p>
      <p className="text-muted-foreground mt-1">{match.goals.join(" · ")}</p>
    </div>
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

type OutcomeKind = "draw" | "loss" | "none" | "win";
interface MatchOutcome {
  kind: OutcomeKind;
  label: string;
  rival?: string;
}

function normalizeFixtureTab(value?: string): FixtureTab {
  return value === "posiciones" || value === "goleadores" || value === "fixture"
    ? value
    : "resumen";
}

function buildFixtureHref(data: LeagueFixtureData, tab: FixtureTab) {
  const params = new URLSearchParams({
    competition: data.selectedCompetitionKey,
    tab,
    year: String(data.selectedYear),
  });

  return `/fixture?${params.toString()}`;
}

function getRoundKey(round: LeagueFixtureRound) {
  return `${round.name}-${round.date}`;
}

function getTeamPositionLabel(rows: LeagueStandingRow[], teamName: string) {
  const row = rows.find((item) => item.teamName === teamName);

  return row ? `${formatOrdinal(row.position)} puesto` : "Sin posición";
}

function formatOrdinal(value: number) {
  if (value === 1) {
    return "1er";
  }

  if (value === 2) {
    return "2do";
  }

  if (value === 3) {
    return "3er";
  }

  return `${value}to`;
}

function getLastPlayedMatchesForTeam(
  matches: LeagueFixtureMatch[],
  teamName: string,
  beforeMatch: LeagueFixtureMatch,
) {
  const beforeValue = getFixtureMatchSortValue(beforeMatch);

  return [...matches]
    .filter(
      (match) =>
        match.status === "played" &&
        isTeamInMatch(match, teamName) &&
        getFixtureMatchSortValue(match) < beforeValue,
    )
    .sort(
      (left, right) => getFixtureMatchSortValue(right) - getFixtureMatchSortValue(left),
    );
}

function getVersusClubResult(
  matches: LeagueFixtureMatch[],
  teamName: string,
): MatchOutcome {
  const match = matches.find(
    (candidate) =>
      candidate.status === "played" &&
      candidate.isClubMatch &&
      isTeamInMatch(candidate, teamName),
  );

  if (!match) {
    return { kind: "none" as const, label: "S/R" };
  }

  const outcome = getTeamMatchOutcome(match, APP_TEAM_NAME);

  return {
    kind: outcome.kind,
    label: outcome.label,
  };
}

function getTeamMatchOutcome(match: LeagueFixtureMatch, teamName: string): MatchOutcome {
  const isLocal = match.localTeam === teamName;
  const teamScore = isLocal ? match.localScore : match.visitorScore;
  const rivalScore = isLocal ? match.visitorScore : match.localScore;
  const rival = isLocal ? match.visitorTeam : match.localTeam;

  if (
    match.status !== "played" ||
    typeof teamScore !== "number" ||
    typeof rivalScore !== "number"
  ) {
    return {
      kind: "none" as const,
      label: "S/R",
      rival,
    };
  }

  return {
    kind: teamScore > rivalScore ? "win" : teamScore === rivalScore ? "draw" : "loss",
    label: `${teamScore}-${rivalScore}`,
    rival,
  };
}

function getOutcomeClassName(kind: OutcomeKind) {
  return {
    draw: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
    loss: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    none: "bg-muted text-muted-foreground",
    win: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  }[kind];
}

function getPositionRowClassName(position: number) {
  if (position === 1) {
    return "bg-amber-50/70 dark:bg-amber-950/20";
  }

  if (position === 2) {
    return "bg-sky-50/70 dark:bg-sky-950/20";
  }

  if (position === 3 || position === 4) {
    return "bg-violet-50/70 dark:bg-violet-950/20";
  }

  return "bg-card";
}

function getPositionBadgeClassName(position: number) {
  if (position === 1) {
    return "bg-amber-500 text-white";
  }

  if (position === 2) {
    return "bg-sky-500 text-white";
  }

  if (position === 3 || position === 4) {
    return "bg-violet-500 text-white";
  }

  return "bg-muted text-muted-foreground";
}

function LegendPill({ className, label }: { className: string; label: string }) {
  return (
    <span className={cn("rounded-md px-2 py-1 font-medium", className)}>{label}</span>
  );
}

function isTeamInMatch(match: LeagueFixtureMatch, teamName: string) {
  return match.localTeam === teamName || match.visitorTeam === teamName;
}

function getFixtureMatchSortValue(match: LeagueFixtureMatch) {
  const time = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const hour = time ? Number(time[1]) : 23;
  const minute = time ? Number(time[2]) : 59;
  const value = new Date(
    `${match.dateIso ?? ""}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`,
  ).getTime();

  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function TeamName({ align = "left", name }: { align?: "left" | "right"; name: string }) {
  const isClub = name === APP_TEAM_NAME;

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        align === "right" ? "justify-end text-right" : "text-left",
        isClub && "text-primary font-semibold",
      )}
      title={name}
    >
      {align === "right" ? null : <TeamAvatar teamName={name} />}
      <span className="min-w-0 truncate">{name}</span>
      {align === "right" ? <TeamAvatar teamName={name} /> : null}
    </span>
  );
}

function TeamAvatar({ teamName }: { teamName: string }) {
  if (teamName === APP_TEAM_NAME) {
    return <BrandMark className="size-8 rounded-full bg-white" />;
  }

  return (
    <span className="bg-muted text-muted-foreground inline-grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold">
      {getTeamInitials(teamName)}
    </span>
  );
}

function getTeamInitials(teamName: string) {
  return teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md p-3">
      <p className="text-muted-foreground text-xs font-semibold uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-normal">{value}</p>
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
