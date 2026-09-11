import { AlertTriangle, CheckCircle2, Clock3, Send, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { DashboardPeriodSelector } from "@/components/dashboard/dashboard-period-selector";
import { PlayersTable } from "@/components/dashboard/players-table";
import { RunWhatsAppReminderBotButton } from "@/components/dashboard/run-whatsapp-reminder-bot-button";
import { SendPendingNotificationsButton } from "@/components/dashboard/send-pending-notifications-button";
import { EmptySection } from "@/components/layout/empty-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { formatPeriod } from "@/lib/player-profile";
import { getDataService } from "@/services/data-service";
import type { PlayerPaymentStatus, PlayerTableRow } from "@/types/dashboard";

export const dynamic = "force-dynamic";

interface FeeTrackingPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function FeeTrackingPage({ searchParams }: FeeTrackingPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "notifications:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Seguimiento de cuotas"
        description="Solo un administrador puede correr el bot y enviar notificaciones masivas."
      />
    );
  }

  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params.period ?? "") ? params.period : undefined;
  const dashboard = await getDataService().getDashboardData(period);
  const counts = countPlayersByPaymentStatus(dashboard.players);
  const periodLabel = formatPeriod(dashboard.period);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">Cuotas</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            Seguimiento de cuotas
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Estado del mes, notificaciones de cuota vencida y bot de WhatsApp para
            jugadores pendientes.
          </p>
        </div>
        <DashboardPeriodSelector period={dashboard.period} />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Total jugadores"
          value={dashboard.players.length}
          detail={`${counts.withDefinedFee} con cuota definida`}
          icon={<UsersRound className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Pagados"
          value={counts.paid}
          detail="Cuota marcada como pagada"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          tone="success"
        />
        <MetricCard
          title="Pendientes"
          value={counts.pending}
          detail="Con cuota definida sin pagar"
          icon={<Clock3 className="size-4" aria-hidden="true" />}
          tone="warning"
        />
        <MetricCard
          title="Vencidos"
          value={counts.debt}
          detail="Deben recibir seguimiento"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
          tone="danger"
        />
        <MetricCard
          title="Sin cuota"
          value={counts.withoutDefinedFee}
          detail={`Sin monto para ${periodLabel}`}
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="text-primary size-5" aria-hidden="true" />
            Acciones del seguimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
          <div className="border-border bg-background grid gap-3 rounded-md border p-4">
            <div>
              <h2 className="text-base font-semibold">Notificaciones push</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Envía el aviso de cuota vencida para el mes seleccionado.
              </p>
            </div>
            <SendPendingNotificationsButton period={dashboard.period} />
          </div>

          <div className="border-border bg-background grid gap-3 rounded-md border p-4">
            <div>
              <h2 className="text-base font-semibold">Bot de WhatsApp</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Abre WhatsApp local y muestra el avance jugador por jugador.
              </p>
            </div>
            <RunWhatsAppReminderBotButton period={dashboard.period} />
          </div>
        </CardContent>
      </Card>

      <PlayersTable rows={dashboard.players} period={dashboard.period} />

      {dashboard.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {dashboard.source.message}
        </section>
      ) : null}
    </main>
  );
}

function MetricCard({
  detail,
  icon,
  title,
  tone = "neutral",
  value,
}: Readonly<{
  detail: string;
  icon: React.ReactNode;
  title: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: number;
}>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
        <div className={getMetricIconClassName(tone)}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function countPlayersByPaymentStatus(
  players: PlayerTableRow[],
): Record<PlayerPaymentStatus | "withDefinedFee" | "withoutDefinedFee", number> {
  return players.reduce(
    (counts, player) => {
      if (!hasDefinedFee(player)) {
        counts.withoutDefinedFee += 1;

        return counts;
      }

      counts.withDefinedFee += 1;
      counts[player.status] += 1;

      return counts;
    },
    {
      debt: 0,
      paid: 0,
      pending: 0,
      withDefinedFee: 0,
      withoutDefinedFee: 0,
    } satisfies Record<
      PlayerPaymentStatus | "withDefinedFee" | "withoutDefinedFee",
      number
    >,
  );
}

function hasDefinedFee(player: Pick<PlayerTableRow, "feeAmount" | "feeSource">) {
  return player.feeSource !== "none" && player.feeAmount > 0;
}

function getMetricIconClassName(tone: "danger" | "neutral" | "success" | "warning") {
  if (tone === "success") {
    return "rounded-md bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }

  if (tone === "warning") {
    return "rounded-md bg-amber-50 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  }

  if (tone === "danger") {
    return "rounded-md bg-rose-50 p-2 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
  }

  return "bg-primary/10 text-primary rounded-md p-2";
}
