import Link from "next/link";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Trophy,
  XCircle,
} from "lucide-react";

import {
  CompetitionBadge,
  getCompetitionCardClass,
} from "@/components/fixture/competition-badge";
import { TeamStatsCard } from "@/components/dashboard/team-stats-card";
import { MatchMediaUploadButton } from "@/components/fixture/match-media-upload-button";
import { NextMatchShareButton } from "@/components/fixture/next-match-share-button";
import { MatchResultShareButton } from "@/components/fixture/match-result-share-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TEAM_NAME } from "@/lib/league-fixture";
import {
  MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY,
  buildMatchRegistrationFormUrl,
  getMatchRegistrationPeriod,
  getMatchRegistrationStatusKeyForFixture,
  type MatchRegistrationStatus,
} from "@/lib/match-registration-form";
import { formatPeriod, getCurrentPeriod } from "@/lib/player-profile";
import { cn } from "@/lib/utils";
import type { PlayerMonthPaymentStatus, PlayerProfile } from "@/types/dashboard";
import type { LeagueFixtureData, LeagueFixtureMatch } from "@/types/fixture";

interface HomeSummaryProps {
  canRegisterPlayers?: boolean;
  canShareAlternateResultFormats?: boolean;
  canUploadMedia?: boolean;
  fixture: LeagueFixtureData;
  playerProfile?: PlayerProfile | null;
  registrationPlayerNamesByPeriod?: Record<string, string[]>;
  registrationStatusByMatchKey?: Record<string, MatchRegistrationStatus>;
  teamStatsMatches?: LeagueFixtureMatch[];
}

const paymentLabels: Record<PlayerMonthPaymentStatus, string> = {
  paid: "Pagada",
  unpaid: "Pendiente",
};

export function HomeSummary({
  canRegisterPlayers = false,
  canShareAlternateResultFormats = false,
  canUploadMedia = false,
  fixture,
  playerProfile,
  registrationPlayerNamesByPeriod = {},
  registrationStatusByMatchKey = {},
  teamStatsMatches,
}: HomeSummaryProps) {
  const latestQuota = playerProfile ? getLatestQuotaMonth(playerProfile) : undefined;
  const nextMatch = fixture.nextMatches[0];
  const lastMatch = fixture.lastMatches[0];
  const standingsRows = buildHomeStandingsRows(fixture);
  const recentFormMatches =
    fixture.allCompetitionMatches.length > 0
      ? fixture.allCompetitionMatches
      : fixture.matches;

  return (
    <section className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {playerProfile ? (
        <Card className="club-animate-fade-up overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeDollarSign className="text-primary size-5" />
                  Mi ultima cuota
                </CardTitle>
                <p className="text-muted-foreground mt-2 text-sm">
                  {latestQuota ? formatPeriod(latestQuota.period) : "Sin cuotas cargadas"}
                </p>
              </div>
              {latestQuota ? <QuotaStatusBadge month={latestQuota} /> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-3xl font-bold tracking-normal">
                {latestQuota?.amount ?? "-"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {latestQuota?.quotaStatus === "undefined"
                  ? latestQuota.quotaStatusReason || "Monto parcial."
                  : latestQuota?.paidAt
                    ? `Pagada el ${latestQuota.paidAt}`
                    : latestQuota?.dueDate
                      ? `Vence ${latestQuota.dueDate}`
                      : "Sin vencimiento cargado"}
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/mi-cuota">
                <ExternalLink />
                Ver mi cuota
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="club-animate-fade-up overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="text-primary size-5" />
            Proximo partido
          </CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {nextMatch
              ? `${nextMatch.competitionName} · ${nextMatch.categoryName}`
              : `${fixture.selectedTournamentName} · ${fixture.selectedCategoryName}`}
          </p>
        </CardHeader>
        <CardContent>
          {nextMatch ? (
            <HomeMatchCard
              canRegisterPlayers={canRegisterPlayers}
              canUploadMedia={canUploadMedia}
              match={nextMatch}
              matches={recentFormMatches}
              registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
              registrationStatusByMatchKey={registrationStatusByMatchKey}
              rows={fixture.standings}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay proximo partido publicado para {APP_TEAM_NAME}.
            </p>
          )}
        </CardContent>
      </Card>

      <TeamStatsCard
        className="md:col-span-2 xl:col-span-4"
        matches={
          teamStatsMatches ??
          (fixture.allClubMatches.length > 0
            ? fixture.allClubMatches
            : fixture.clubMatches)
        }
        selectedCompetitionKey={fixture.selectedCompetitionKey}
        selectedYear={fixture.selectedYear}
        teamName={APP_TEAM_NAME}
      />

      <Card className="club-animate-fade-up overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="text-primary size-5" />
            Ultimo partido
          </CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {lastMatch
              ? `${lastMatch.competitionName} · ${lastMatch.categoryName}`
              : fixture.selectedCategoryName}
          </p>
        </CardHeader>
        <CardContent>
          {lastMatch ? (
            <HomePlayedMatchCard
              canRegisterPlayers={canRegisterPlayers}
              canShareAlternateResultFormats={canShareAlternateResultFormats}
              canUploadMedia={canUploadMedia}
              match={lastMatch}
              registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
              registrationStatusByMatchKey={registrationStatusByMatchKey}
              rows={fixture.standings}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay partido anterior publicado para {APP_TEAM_NAME}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="club-animate-fade-up overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="text-primary size-5" />
            Ultima tabla
          </CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {fixture.clubStanding
              ? `${fixture.clubStanding.points} puntos para ${APP_TEAM_NAME}`
              : fixture.selectedCategoryName}
          </p>
        </CardHeader>
        <CardContent>
          {standingsRows.length > 0 ? (
            <div className="grid gap-2">
              {standingsRows.map((row) => (
                <div
                  key={`${row.position}-${row.teamName}`}
                  className={cn(
                    "border-border bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
                    row.isClub && "border-primary/30 bg-secondary/80",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold",
                        row.isClub && "bg-primary text-primary-foreground",
                      )}
                    >
                      {row.position}
                    </span>
                    <span className="truncate font-medium">{row.teamName}</span>
                  </div>
                  <span className="shrink-0 font-bold">{row.points} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Sin tabla publicada.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function HomeMatchCard({
  canRegisterPlayers,
  canUploadMedia,
  match,
  matches,
  registrationPlayerNamesByPeriod,
  registrationStatusByMatchKey,
  rows,
}: {
  canRegisterPlayers: boolean;
  canUploadMedia: boolean;
  match: LeagueFixtureMatch;
  matches: LeagueFixtureMatch[];
  registrationPlayerNamesByPeriod: Record<string, string[]>;
  registrationStatusByMatchKey: Record<string, MatchRegistrationStatus>;
  rows: LeagueFixtureData["standings"];
}) {
  const localPosition =
    match.competitionKind === "league"
      ? getTeamPositionLabel(rows, match.localTeam)
      : undefined;
  const visitorPosition =
    match.competitionKind === "league"
      ? getTeamPositionLabel(rows, match.visitorTeam)
      : undefined;

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 rounded-md border p-3",
        getCompetitionCardClass(match.competitionKind),
      )}
    >
      <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate">
          {match.round}
          {match.roundDate ? ` · ${match.roundDate}` : ""}
        </span>
        <span className="shrink-0">{match.time || "-"}</span>
      </div>
      <CompetitionBadge kind={match.competitionKind} />
      <div className="grid gap-2 text-sm">
        <TeamLine local name={match.localTeam} position={localPosition} />
        <div className="text-muted-foreground px-3 text-xs font-bold">vs</div>
        <TeamLine name={match.visitorTeam} position={visitorPosition} />
      </div>
      <div className="border-border grid gap-3 border-t pt-3">
        <RecentTeamMatches
          beforeMatch={match}
          matches={matches}
          teamName={match.localTeam}
        />
        <RecentTeamMatches
          beforeMatch={match}
          matches={matches}
          teamName={match.visitorTeam}
        />
      </div>
      <NextMatchShareButton
        match={match}
        matches={matches}
        standings={rows}
        teamName={APP_TEAM_NAME}
      />
      <MatchRegistrationAction
        canRegisterPlayers={canRegisterPlayers}
        match={match}
        registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
        registrationStatusByMatchKey={registrationStatusByMatchKey}
      />
      <Button asChild size="sm" variant="outline">
        <Link href="/fixture">
          <CalendarDays />
          Ver fixture
        </Link>
      </Button>
      {canUploadMedia ? (
        <MatchMediaUploadButton
          matchDate={match.roundDate}
          matchId={match.id}
          rival={getMatchRival(match)}
        />
      ) : null}
    </div>
  );
}

function HomePlayedMatchCard({
  canRegisterPlayers,
  canShareAlternateResultFormats,
  canUploadMedia,
  match,
  registrationPlayerNamesByPeriod,
  registrationStatusByMatchKey,
  rows,
}: {
  canRegisterPlayers: boolean;
  canShareAlternateResultFormats: boolean;
  canUploadMedia: boolean;
  match: LeagueFixtureMatch;
  registrationPlayerNamesByPeriod: Record<string, string[]>;
  registrationStatusByMatchKey: Record<string, MatchRegistrationStatus>;
  rows: LeagueFixtureData["standings"];
}) {
  const localPosition =
    match.competitionKind === "league"
      ? getTeamPositionLabel(rows, match.localTeam)
      : undefined;
  const visitorPosition =
    match.competitionKind === "league"
      ? getTeamPositionLabel(rows, match.visitorTeam)
      : undefined;

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 rounded-md border p-3",
        getCompetitionCardClass(match.competitionKind),
      )}
    >
      <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate">
          {match.round}
          {match.roundDate ? ` · ${match.roundDate}` : ""}
        </span>
        <span className="shrink-0">{match.time || "-"}</span>
      </div>
      <CompetitionBadge kind={match.competitionKind} />
      <div className="grid gap-2 text-sm">
        <TeamLine
          local
          name={match.localTeam}
          penaltyScore={match.localPenaltyScore}
          position={localPosition}
          score={match.localScore}
          showScore
        />
        <div className="text-primary px-3 text-center text-sm font-bold">
          {formatMatchScore(match)}
        </div>
        <TeamLine
          name={match.visitorTeam}
          penaltyScore={match.visitorPenaltyScore}
          position={visitorPosition}
          score={match.visitorScore}
          showScore
        />
      </div>
      <MatchGoalsList match={match} />
      <MatchResultShareButton
        match={match}
        showAdminFormats={canShareAlternateResultFormats}
        teamName={APP_TEAM_NAME}
      />
      <MatchRegistrationAction
        canRegisterPlayers={canRegisterPlayers}
        match={match}
        registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
        registrationStatusByMatchKey={registrationStatusByMatchKey}
      />
      {canUploadMedia ? (
        <MatchMediaUploadButton
          matchDate={match.roundDate}
          matchId={match.id}
          rival={getMatchRival(match)}
        />
      ) : null}
      <Button asChild size="sm" variant="outline">
        <Link href="/fixture">
          <CalendarDays />
          Ver fixture
        </Link>
      </Button>
    </div>
  );
}

function MatchRegistrationAction({
  canRegisterPlayers,
  match,
  registrationPlayerNamesByPeriod,
  registrationStatusByMatchKey,
}: {
  canRegisterPlayers: boolean;
  match: LeagueFixtureMatch;
  registrationPlayerNamesByPeriod: Record<string, string[]>;
  registrationStatusByMatchKey: Record<string, MatchRegistrationStatus>;
}) {
  if (!canRegisterPlayers || !match.isClubMatch) {
    return null;
  }

  const registrationStatus =
    registrationStatusByMatchKey[getMatchRegistrationStatusKeyForFixture(match)];

  if (registrationStatus?.registered) {
    return (
      <Badge variant="success" className="w-fit gap-1.5">
        <CheckCircle2 className="size-3.5" />
        Jugadores cargados
        {registrationStatus.playersCount > 0
          ? ` (${registrationStatus.playersCount})`
          : ""}
      </Badge>
    );
  }

  const registrationPlayerNames =
    registrationPlayerNamesByPeriod[getMatchRegistrationPeriod(match)] ??
    registrationPlayerNamesByPeriod[MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY] ??
    [];

  return (
    <Button asChild size="sm" variant="secondary">
      <a
        href={buildMatchRegistrationFormUrl({
          match,
          playerNames: registrationPlayerNames,
        })}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink />
        Registrar jugadores
      </a>
    </Button>
  );
}

function RecentTeamMatches({
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
    <div className="grid min-w-0 gap-2">
      <p className="text-muted-foreground truncate text-xs font-semibold uppercase">
        Últimos de {teamName}
      </p>
      {recentMatches.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {recentMatches.map((recentMatch) => {
            const outcome = getTeamMatchOutcome(recentMatch, teamName);

            return (
              <span
                key={recentMatch.id}
                className={cn(
                  "inline-flex max-w-full rounded-md px-2 py-1 text-xs font-semibold",
                  getOutcomeClassName(outcome.kind),
                )}
              >
                <span className="truncate">
                  {outcome.label} vs {outcome.rival}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Sin partidos anteriores.</p>
      )}
    </div>
  );
}

function MatchGoalsList({ match }: { match: LeagueFixtureMatch }) {
  if (match.goals.length === 0) {
    return (
      <p className="text-muted-foreground bg-muted/60 rounded-md px-3 py-2 text-xs">
        Sin detalle de goles publicado.
      </p>
    );
  }

  return (
    <div className="bg-muted/60 min-w-0 rounded-md px-3 py-2 text-xs">
      <p className="font-semibold">Goles</p>
      <p className="text-muted-foreground mt-1 break-words">{match.goals.join(" · ")}</p>
    </div>
  );
}

function TeamLine({
  local = false,
  name,
  penaltyScore,
  position,
  score,
  showScore = false,
}: {
  local?: boolean;
  name: string;
  penaltyScore?: number;
  position?: string;
  score?: number;
  showScore?: boolean;
}) {
  const isClub = name === APP_TEAM_NAME;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2",
        isClub ? "bg-primary text-primary-foreground" : "bg-muted/60",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{name}</span>
        <span className="text-xs opacity-75">
          {[local ? "Local" : "Visita", position].filter(Boolean).join(" · ")}
        </span>
      </span>
      {showScore ? <TeamScore penaltyScore={penaltyScore} score={score} /> : null}
    </div>
  );
}

function TeamScore({ penaltyScore, score }: { penaltyScore?: number; score?: number }) {
  return (
    <span className="shrink-0 text-xl font-bold tracking-normal">
      {score ?? 0}
      {typeof penaltyScore === "number" ? (
        <span className="ml-1 align-baseline text-sm font-semibold opacity-80">
          ({penaltyScore})
        </span>
      ) : null}
    </span>
  );
}

function QuotaStatusBadge({
  month,
}: {
  month: NonNullable<ReturnType<typeof getLatestQuotaMonth>>;
}) {
  if (month.quotaStatus === "undefined") {
    return <Badge variant="warning">Sin definir</Badge>;
  }

  const paid = month.status === "paid";
  const Icon = paid ? CheckCircle2 : XCircle;

  return (
    <Badge variant={paid ? "success" : "danger"} className="gap-1.5">
      <Icon className="size-3.5" />
      {paymentLabels[month.status]}
    </Badge>
  );
}

function getLatestQuotaMonth(profile: PlayerProfile) {
  const currentPeriod = getCurrentPeriod();
  const sortedMonths = [...profile.months].sort((left, right) =>
    right.period.localeCompare(left.period),
  );

  return (
    profile.months.find((month) => month.period === currentPeriod) ??
    sortedMonths.find((month) => month.amountValue > 0 || month.amount !== "-") ??
    sortedMonths[0]
  );
}

function buildHomeStandingsRows(fixture: LeagueFixtureData) {
  const topRows = fixture.standings.slice(0, 3);
  const clubStanding = fixture.clubStanding;

  if (!clubStanding || clubStanding.position <= 3) {
    return topRows;
  }

  return [...topRows, clubStanding];
}

function getTeamPositionLabel(rows: LeagueFixtureData["standings"], teamName: string) {
  const row = rows.find((item) => item.teamName === teamName);

  return row ? `${formatOrdinal(row.position)} puesto` : "Sin posición";
}

function getMatchRival(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
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

function formatMatchScore(match: LeagueFixtureMatch) {
  if (typeof match.localScore === "number" && typeof match.visitorScore === "number") {
    const score = `${match.localScore}-${match.visitorScore}`;

    return hasPenaltyScore(match)
      ? `${score} (${match.localPenaltyScore}-${match.visitorPenaltyScore} pen)`
      : score;
  }

  return "S/R";
}

type OutcomeKind = "draw" | "loss" | "none" | "win";

interface MatchOutcome {
  kind: OutcomeKind;
  label: string;
  rival?: string;
}

function getLastPlayedMatchesForTeam(
  matches: LeagueFixtureMatch[],
  teamName: string,
  beforeMatch: LeagueFixtureMatch,
) {
  const beforeValue = getHomeMatchSortValue(beforeMatch);

  return [...matches]
    .filter(
      (match) =>
        match.status === "played" &&
        isTeamInMatch(match, teamName) &&
        getHomeMatchSortValue(match) < beforeValue,
    )
    .sort((left, right) => getHomeMatchSortValue(right) - getHomeMatchSortValue(left));
}

function getTeamMatchOutcome(match: LeagueFixtureMatch, teamName: string): MatchOutcome {
  const isLocal = areSameFixtureTeam(match.localTeam, teamName);
  const teamScore = isLocal ? match.localScore : match.visitorScore;
  const rivalScore = isLocal ? match.visitorScore : match.localScore;
  const teamPenaltyScore = isLocal ? match.localPenaltyScore : match.visitorPenaltyScore;
  const rivalPenaltyScore = isLocal ? match.visitorPenaltyScore : match.localPenaltyScore;
  const rival = isLocal ? match.visitorTeam : match.localTeam;

  if (
    match.status !== "played" ||
    typeof teamScore !== "number" ||
    typeof rivalScore !== "number"
  ) {
    return {
      kind: "none",
      label: "S/R",
      rival,
    };
  }

  const hasPenalties =
    typeof teamPenaltyScore === "number" && typeof rivalPenaltyScore === "number";
  const kind =
    teamScore > rivalScore
      ? "win"
      : teamScore < rivalScore
        ? "loss"
        : hasPenalties && teamPenaltyScore !== rivalPenaltyScore
          ? teamPenaltyScore > rivalPenaltyScore
            ? "win"
            : "loss"
          : "draw";
  const label = hasPenalties
    ? `${teamScore}-${rivalScore} (${teamPenaltyScore}-${rivalPenaltyScore} pen)`
    : `${teamScore}-${rivalScore}`;

  return {
    kind,
    label,
    rival,
  };
}

function hasPenaltyScore(match: LeagueFixtureMatch) {
  return (
    typeof match.localPenaltyScore === "number" &&
    typeof match.visitorPenaltyScore === "number"
  );
}

function isTeamInMatch(match: LeagueFixtureMatch, teamName: string) {
  return (
    areSameFixtureTeam(match.localTeam, teamName) ||
    areSameFixtureTeam(match.visitorTeam, teamName)
  );
}

function areSameFixtureTeam(left: string, right: string) {
  return normalizeFixtureTeamKey(left) === normalizeFixtureTeamKey(right);
}

function normalizeFixtureTeamKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(club|asociacion deportiva|asoc deportiva)\s+/, "");
}

function getHomeMatchSortValue(match: LeagueFixtureMatch) {
  const time = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const hour = time ? Number(time[1]) : 23;
  const minute = time ? Number(time[2]) : 59;
  const value = new Date(
    `${match.dateIso ?? ""}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`,
  ).getTime();

  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function getOutcomeClassName(kind: OutcomeKind) {
  return {
    draw: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
    loss: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    none: "bg-muted text-muted-foreground",
    win: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  }[kind];
}
