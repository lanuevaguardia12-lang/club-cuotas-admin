import Link from "next/link";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Trophy,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TEAM_NAME } from "@/lib/league-fixture";
import { formatPeriod, getCurrentPeriod } from "@/lib/player-profile";
import { cn } from "@/lib/utils";
import type { PlayerMonthPaymentStatus, PlayerProfile } from "@/types/dashboard";
import type { LeagueFixtureData, LeagueFixtureMatch } from "@/types/fixture";

interface HomeSummaryProps {
  fixture: LeagueFixtureData;
  playerProfile?: PlayerProfile | null;
}

const paymentLabels: Record<PlayerMonthPaymentStatus, string> = {
  paid: "Pagada",
  unpaid: "Pendiente",
};

export function HomeSummary({ fixture, playerProfile }: HomeSummaryProps) {
  const latestQuota = playerProfile ? getLatestQuotaMonth(playerProfile) : undefined;
  const nextMatch = fixture.nextMatches[0];
  const standingsRows = buildHomeStandingsRows(fixture);

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {playerProfile ? (
        <Card className="club-animate-fade-up">
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

      <Card className="club-animate-fade-up">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="text-primary size-5" />
            Proximo partido
          </CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {fixture.selectedTournamentName} · {fixture.selectedCategoryName}
          </p>
        </CardHeader>
        <CardContent>
          {nextMatch ? (
            <HomeMatchCard match={nextMatch} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay proximo partido publicado para {APP_TEAM_NAME}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="club-animate-fade-up">
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

function HomeMatchCard({ match }: { match: LeagueFixtureMatch }) {
  return (
    <div className="border-border bg-background grid gap-3 rounded-md border p-3">
      <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
        <span>
          {match.round}
          {match.roundDate ? ` · ${match.roundDate}` : ""}
        </span>
        <span>{match.time || "-"}</span>
      </div>
      <div className="grid gap-2 text-sm">
        <TeamLine local name={match.localTeam} />
        <div className="text-muted-foreground px-3 text-xs font-bold">vs</div>
        <TeamLine name={match.visitorTeam} />
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/fixture">
          <CalendarDays />
          Ver fixture
        </Link>
      </Button>
    </div>
  );
}

function TeamLine({ local = false, name }: { local?: boolean; name: string }) {
  const isClub = name === APP_TEAM_NAME;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-3 py-2",
        isClub ? "bg-primary text-primary-foreground" : "bg-muted/60",
      )}
    >
      <span className="truncate font-semibold">{name}</span>
      <span className="text-xs opacity-75">{local ? "Local" : "Visita"}</span>
    </div>
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
