import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { FixtureContent } from "@/components/fixture/fixture-content";
import { FixtureFilters } from "@/components/fixture/fixture-filters";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/lib/auth/roles";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import {
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import {
  MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY,
  getMatchRegistrationPeriod,
} from "@/lib/match-registration-form";
import { getDataService } from "@/services/data-service";
import type { IDataService } from "@/services/IDataService";
import type { LeagueFixtureMatch } from "@/types/fixture";

export const dynamic = "force-dynamic";

interface FixturePageProps {
  searchParams: Promise<{
    competition?: string;
    torneo?: string;
    campeonato?: string;
    round?: string | string[];
    tab?: string;
    year?: string;
  }>;
}

export default async function FixturePage({ searchParams }: FixturePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (!hasPermission(user, "fixture:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Fixture"
        description="Tu rol no tiene permisos para ver fixtures y tablas de la liga."
      />
    );
  }

  const params = await searchParams;
  const rawData = await getLeagueFixtureData({
    competition: params.competition,
    tournamentId: params.torneo,
    categoryId: params.campeonato,
    year: params.year,
  });
  const dataService = getDataService();
  const fixtureScheduleOverrides = await dataService
    .getFixtureMatchScheduleOverrides()
    .catch(() => []);
  const data = applyLeagueFixtureScheduleOverrides(rawData, fixtureScheduleOverrides);
  const canManageFixture = user.role === "admin";
  const canRegisterPlayers = user.role === "coach";
  const canUploadMedia = user.role === "fan";
  const playerOptions = canManageFixture
    ? (await dataService.getPlayersData().catch(() => ({ players: [] }))).players
        .filter((player) => player.status === "active")
        .map((player) => ({ id: player.id, name: player.name }))
    : [];
  const registrationPlayerNamesByPeriod = canRegisterPlayers
    ? await getRegistrationPlayerNamesByPeriod(dataService, data.allClubMatches)
    : {};

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Liga Country Sur</p>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              <CalendarDays className="text-primary size-7" aria-hidden="true" />
              Fixture
              <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
                {data.source.status}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Tabla de posiciones, partidos del equipo y fixture oficial de la liga.
            </p>
          </div>
          <FixtureFilters
            activeTab={params.tab}
            availableYears={data.availableYears}
            selectedCompetitionKey={data.selectedCompetitionKey}
            selectedYear={data.selectedYear}
            tournaments={data.tournaments}
          />
        </div>
      </header>

      <FixtureContent
        activeTab={params.tab}
        canManage={canManageFixture}
        canRegisterPlayers={canRegisterPlayers}
        canUploadMedia={canUploadMedia}
        data={data}
        playerOptions={playerOptions}
        registrationPlayerNamesByPeriod={registrationPlayerNamesByPeriod}
        selectedRoundKeys={toArray(params.round)}
      />
    </main>
  );
}

function toArray(value?: string | string[]) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function getRegistrationPlayerNamesByPeriod(
  dataService: IDataService,
  matches: LeagueFixtureMatch[],
) {
  const basePlayerNames = (
    await dataService.getPlayersData().catch(() => ({ players: [] }))
  ).players
    .filter((player) => player.status === "active")
    .map((player) => player.name);
  const periods = Array.from(
    new Set(
      matches
        .filter((match) => match.isClubMatch)
        .map(getMatchRegistrationPeriod)
        .filter((period) => period !== MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY),
    ),
  );
  const entries = await Promise.all(
    periods.map(async (period) => {
      const calculatorData = await dataService
        .getFeeCalculatorData(period)
        .catch(() => null);
      const periodPlayerNames =
        calculatorData?.players
          .filter((player) => player.status === "active")
          .map((player) => player.name) ?? [];

      return [
        period,
        periodPlayerNames.length > 0 ? periodPlayerNames : basePlayerNames,
      ] as const;
    }),
  );

  return {
    [MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY]: basePlayerNames,
    ...Object.fromEntries(entries),
  };
}
