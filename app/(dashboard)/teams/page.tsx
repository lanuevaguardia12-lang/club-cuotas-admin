import { redirect } from "next/navigation";
import { Shield } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { TeamDirectoryContent } from "@/components/teams/team-directory-content";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import {
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { normalizeTeamProfileKey } from "@/lib/team-profiles";
import { getDataService } from "@/services/data-service";
import type { LeagueFixtureData } from "@/types/fixture";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "teams:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Equipos"
        description="Tu rol no tiene permisos para administrar equipos."
      />
    );
  }

  const dataService = getDataService();
  const [teamsData, fixture] = await Promise.all([
    dataService.getTeamsData(),
    getFixtureDataWithOverrides(),
  ]);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">Fixture</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <Shield className="text-primary size-7" aria-hidden="true" />
            Equipos
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Nombre corto y escudo para cards de partido y placas.
          </p>
        </div>
      </header>

      <TeamDirectoryContent
        data={teamsData}
        detectedTeamNames={collectTeamNames(fixture)}
      />
    </main>
  );
}

async function getFixtureDataWithOverrides() {
  const dataService = getDataService();
  const [fixture, overrides] = await Promise.all([
    getLeagueFixtureData(),
    dataService.getFixtureMatchScheduleOverrides().catch(() => []),
  ]);

  return applyLeagueFixtureScheduleOverrides(fixture, overrides);
}

function collectTeamNames(fixture: LeagueFixtureData) {
  const namesByKey = new Map<string, string>();
  const matches =
    fixture.allCompetitionMatches.length > 0
      ? fixture.allCompetitionMatches
      : fixture.matches;

  for (const match of matches) {
    addTeamName(namesByKey, match.localTeam);
    addTeamName(namesByKey, match.visitorTeam);
  }

  for (const row of fixture.standings) {
    addTeamName(namesByKey, row.teamName);
  }

  return [...namesByKey.values()].sort((left, right) => left.localeCompare(right, "es"));
}

function addTeamName(namesByKey: Map<string, string>, name: string) {
  const key = normalizeTeamProfileKey(name);

  if (key && !namesByKey.has(key)) {
    namesByKey.set(key, name);
  }
}
