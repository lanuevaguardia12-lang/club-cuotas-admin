import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

import { AnnualMvpCard } from "@/components/player-of-match/annual-mvp-card";
import { PlayerOfMatchContent } from "@/components/player-of-match/player-of-match-content";
import { Badge } from "@/components/ui/badge";
import { isAnnualMvpSelfVote, type AnnualMvpSurvey } from "@/lib/annual-mvp";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import { AnnualMvpStore } from "@/services/database/annual-mvp-store";

export const dynamic = "force-dynamic";

export default async function PlayerOfMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; anio?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const dataService = getDataService();
  const [data, teamsData, annualSurveys, params] = await Promise.all([
    dataService.getPlayerOfMatchData(user.id, user.playerId),
    dataService.getTeamsData().catch(() => ({ teams: [] })),
    new AnnualMvpStore().list(user.id).catch(() => null),
    searchParams,
  ]);
  const canManage = hasPermission(user, "player-of-match:manage");
  const canVote = user.role !== "admin" && hasPermission(user, "player-of-match:vote");
  const showAnnualFirst = params.tab === "mvp-del-ano";
  const requestedYear = showAnnualFirst ? params.anio : undefined;
  const requestedSurvey = annualSurveys?.find(
    (survey) => String(survey.year) === requestedYear,
  );
  const surveys =
    annualSurveys && requestedSurvey
      ? [requestedSurvey, ...annualSurveys.filter((survey) => survey !== requestedSurvey)]
      : annualSurveys;
  const renderSurvey = (survey: AnnualMvpSurvey) => (
    <AnnualMvpCard
      key={survey.year}
      survey={survey}
      canVote={canVote}
      excludedIds={survey.candidates
        .filter((candidate) => isAnnualMvpSelfVote(candidate, user))
        .map((candidate) => candidate.id)}
    />
  );

  return (
    <main className="grid min-w-0 gap-6 overflow-hidden">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm font-medium">
            Votación del plantel
          </p>
          <h1 className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <Trophy className="text-primary size-7 shrink-0" />
            MVP y rachas
          </h1>
          <p className="text-muted-foreground mt-2 max-w-full text-sm break-words sm:max-w-2xl">
            Votá el MVP, revisá resultados y compará rankings internos del plantel.
          </p>
        </div>
        <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
          {data.source.status}
        </Badge>
      </header>

      <PlayerOfMatchContent
        key={showAnnualFirst ? `annual-${requestedYear ?? "all"}` : "mvp"}
        initialTab={showAnnualFirst ? "annual" : "mvp"}
        openAnnualMvp={surveys?.filter((survey) => !survey.closed).map(renderSurvey)}
        annualMvp={
          surveys?.length ? (
            surveys.map(renderSurvey)
          ) : (
            <p className="text-muted-foreground rounded-md border p-4 text-sm">
              {surveys
                ? "Todavía no hay votaciones de MVP del año publicadas."
                : "No se pudieron cargar las votaciones de MVP del año."}
            </p>
          )
        }
        canManage={canManage}
        canVote={canVote}
        data={data}
        teamProfiles={teamsData.teams}
        voteMode={
          user.role === "fan" ? "fan" : user.role === "coach" ? "coach" : "player"
        }
      />
    </main>
  );
}
