import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Database,
  Percent,
  TrendingUp,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardPeriodSelector } from "@/components/dashboard/dashboard-period-selector";
import { HomeSummary } from "@/components/dashboard/home-summary";
import { RunWhatsAppReminderBotButton } from "@/components/dashboard/run-whatsapp-reminder-bot-button";
import { SendPendingNotificationsButton } from "@/components/dashboard/send-pending-notifications-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import {
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { findPlayerProfileForUser } from "@/lib/player-profile";
import { getDataService } from "@/services/data-service";

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

  if (user.role === "player") {
    const [fixture, playerProfile] = await Promise.all([
      fixturePromise,
      findPlayerProfileForUser(user),
    ]);

    return (
      <main className="grid min-w-0 gap-6 overflow-hidden">
        <header className="grid min-w-0 gap-2">
          <p className="text-muted-foreground text-sm font-medium">Home</p>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Hola, {user.name}
          </h1>
          <p className="text-muted-foreground max-w-full text-sm break-words sm:max-w-2xl">
            Tu cuota, el proximo partido y la tabla del torneo en una vista rapida.
          </p>
        </header>

        <HomeSummary fixture={fixture} playerProfile={playerProfile} />
      </main>
    );
  }

  const [dashboard, fixture] = await Promise.all([
    dataService.getDashboardData(period),
    fixturePromise,
  ]);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Home</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Home</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Indicadores operativos, morosidad, ingresos y cuotas calculadas por mes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Database className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="font-medium">{dashboard.source.provider}</span>
              <span
                className={
                  dashboard.source.status === "ready"
                    ? "text-primary"
                    : dashboard.source.status === "empty"
                      ? "text-muted-foreground"
                      : "text-destructive"
                }
              >
                {dashboard.source.status}
              </span>
            </div>
            <DashboardPeriodSelector period={dashboard.period} />
            {user?.role === "admin" ? (
              <>
                <SendPendingNotificationsButton period={dashboard.period} />
                <RunWhatsAppReminderBotButton period={dashboard.period} />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <HomeSummary fixture={fixture} />

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

      <DashboardContent
        charts={dashboard.charts}
        players={dashboard.players}
        period={dashboard.period}
      />

      {dashboard.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {dashboard.source.message}
        </section>
      ) : null}

      <section className="border-border bg-card grid min-h-80 place-items-center rounded-lg border border-dashed p-6 text-center">
        <div className="max-w-sm">
          <div className="bg-muted mx-auto grid size-12 place-items-center rounded-lg">
            <BarChart3 className="text-muted-foreground size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{dashboard.emptyState.title}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {dashboard.emptyState.description}
          </p>
          <p className="text-muted-foreground mt-4 text-xs">
            Cache: {dashboard.source.revalidateSeconds}s
          </p>
        </div>
      </section>
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
