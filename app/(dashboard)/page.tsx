import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Percent,
  TrendingUp,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";

import { DashboardPeriodSelector } from "@/components/dashboard/dashboard-period-selector";
import { HomeSummary } from "@/components/dashboard/home-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentCoachName } from "@/lib/coach-users";
import {
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
  getLeagueClubMatchesForYear,
} from "@/lib/league-fixture";
import {
  buildMatchRegistrationStatusByMatchKey,
  getRegistrationPlayerNamesByPeriod,
} from "@/lib/match-registration-form";
import { findPlayerProfileForUser } from "@/lib/player-profile";
import { getDataService } from "@/services/data-service";
import type {
  FixturePlayerOption,
  LeagueFixtureData,
  LeagueFixtureMatch,
} from "@/types/fixture";

export const dynamic = "force-dynamic";

const metricIcons = {
  "total-players": UsersRound,
  "delinquency-rate": Percent,
  "monthly-income": CircleDollarSign,
  "annual-income": TrendingUp,
  "new-players": UserPlus,
  "dropped-players": UserMinus,
  debtors: AlertTriangle,
};

const metricTones = {
  neutral: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

interface DashboardPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params.period ?? "") ? params.period : undefined;
  const dataService = getDataService();
  const fixturePromise = getFixtureDataWithOverrides();

  if (!hasPermission(user, "dashboard:read")) {
    redirect("/account");
  }

  if (user.role === "player" || user.role === "fan" || user.role === "coach") {
    const canRegisterPlayers = user.role === "coach";
    const [fixture, playerProfile, playerOfMatchData, teamsData, settingsData] =
      await Promise.all([
        fixturePromise,
        user.role === "player" ? findPlayerProfileForUser(user) : null,
        canRegisterPlayers
          ? dataService.getPlayerOfMatchData(user.id, user.playerId).catch(() => null)
          : null,
        dataService.getTeamsData().catch(() => ({ teams: [] })),
        dataService.getAppSettings(),
      ]);
    const isFan = user.role === "fan";
    const isCoach = user.role === "coach";
    const [registrationPlayerNamesByPeriod, teamStatsMatches] = await Promise.all([
      canRegisterPlayers
        ? getRegistrationPlayerNamesByPeriod(dataService, fixture.allClubMatches)
        : {},
      getTeamStatsMatches(fixture),
    ]);
    const registrationStatusByMatchKey = playerOfMatchData
      ? buildMatchRegistrationStatusByMatchKey(playerOfMatchData.matches)
      : {};

    return (
      <main className="grid min-w-0 gap-6 overflow-hidden">
        <header className="grid min-w-0 gap-2">
          <p className="text-muted-foreground text-sm font-medium">Home</p>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Hola, {user.name}
          </h1>
          <p className="text-muted-foreground max-w-full text-sm break-words sm:max-w-2xl">
            {isFan || isCoach
              ? "El proximo partido, el ultimo resultado y la tabla del torneo en una vista rapida."
              : "Tu cuota, el proximo partido y la tabla del torneo en una vista rapida."}
          </p>
        </header>

        <HomeSummary
          canRegisterPlayers={canRegisterPlayers}
          canUploadMedia={isFan}
          fixture={fixture}
          paymentAlias={settingsData.settings.paymentAlias}
          playerProfile={playerProfile}
          registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
          registrationStatusByMatchKey={registrationStatusByMatchKey}
          teamProfiles={teamsData.teams}
          teamStatsMatches={teamStatsMatches}
        />
      </main>
    );
  }

  const [dashboard, fixture, playerOptions, coachName, teamsData] = await Promise.all([
    dataService.getDashboardData(period),
    fixturePromise,
    getFixturePlayerOptions(dataService),
    getCurrentCoachName(dataService),
    dataService.getTeamsData().catch(() => ({ teams: [] })),
  ]);
  const teamStatsMatches = await getTeamStatsMatches(fixture);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Home</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Home</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Vista rapida del club, competencia e indicadores principales del mes.
            </p>
          </div>
          <DashboardPeriodSelector period={dashboard.period} />
        </div>
      </header>

      <HomeSummary
        canManageConvocations={user.role === "admin"}
        canShareAlternateResultFormats={user.role === "admin"}
        coachName={coachName}
        fixture={fixture}
        playerOptions={playerOptions}
        teamProfiles={teamsData.teams}
        teamStatsMatches={teamStatsMatches}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dashboard.metrics.map((item) => {
          const Icon = metricIcons[item.id as keyof typeof metricIcons] ?? BarChart3;

          return (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {item.title}
                </CardTitle>
                <div className={`rounded-md p-2 ${metricTones[item.tone]}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{item.value}</div>
                <p className="text-muted-foreground mt-1 text-sm">{item.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {dashboard.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {dashboard.source.message}
        </section>
      ) : null}
    </main>
  );
}

async function getFixtureDataWithOverrides() {
  const [fixture, overrides] = await Promise.all([
    getLeagueFixtureData(),
    getDataService()
      .getFixtureMatchScheduleOverrides()
      .catch(() => []),
  ]);

  return applyLeagueFixtureScheduleOverrides(fixture, overrides);
}

async function getFixturePlayerOptions(
  dataService: ReturnType<typeof getDataService>,
): Promise<FixturePlayerOption[]> {
  return (await dataService.getPlayersData().catch(() => ({ players: [] }))).players
    .filter((player) => player.status === "active")
    .map((player) => ({
      id: player.id,
      jerseyNumber: player.jerseyNumber,
      name: player.name,
      position: player.position,
      secondPosition: player.secondPosition,
    }));
}

async function getTeamStatsMatches(fixture: LeagueFixtureData) {
  const currentYearMatches =
    fixture.allClubMatches.length > 0 ? fixture.allClubMatches : fixture.clubMatches;
  const otherYears = fixture.availableYears.filter(
    (year) => year !== fixture.selectedYear,
  );
  const otherYearMatches = await Promise.all(
    otherYears.map((year) =>
      getLeagueClubMatchesForYear(year, fixture.tournaments).catch(
        () => [] as LeagueFixtureMatch[],
      ),
    ),
  );

  return dedupeFixtureMatches([...currentYearMatches, ...otherYearMatches.flat()]);
}

function dedupeFixtureMatches(matches: LeagueFixtureMatch[]) {
  const seen = new Set<string>();
  const uniqueMatches: LeagueFixtureMatch[] = [];

  for (const match of matches) {
    const key = [
      match.id,
      match.dateIso ?? match.roundDate,
      match.localTeam,
      match.visitorTeam,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueMatches.push(match);
  }

  return uniqueMatches;
}
