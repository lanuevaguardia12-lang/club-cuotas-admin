import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, History, Phone } from "lucide-react";

import { updatePlayerMonthStatus } from "@/app/(dashboard)/players/[playerId]/actions";
import { MonthStatusSubmitButton } from "@/components/players/month-status-submit-button";
import { ReminderButton } from "@/components/reminders/reminder-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationLink } from "@/components/ui/navigation-link";
import { getDataService } from "@/services/data-service";
import type {
  PlayerFeeHistoryItem,
  PlayerMonthPaymentStatus,
  PlayerYearMonth,
} from "@/types/dashboard";

export const dynamic = "force-dynamic";

interface PlayerPageProps {
  params: Promise<{
    playerId: string;
  }>;
  searchParams: Promise<{
    year?: string;
  }>;
}

const monthStatusLabels: Record<PlayerMonthPaymentStatus, string> = {
  paid: "Pagado",
  unpaid: "Impago",
};

const monthStatusVariants: Record<PlayerMonthPaymentStatus, "success" | "danger"> = {
  paid: "success",
  unpaid: "danger",
};

const historyStatusLabels: Record<PlayerFeeHistoryItem["status"], string> = {
  paid: "Pagado",
  debt: "Debe",
  pending: "Pendiente",
};

const historyStatusVariants: Record<
  PlayerFeeHistoryItem["status"],
  "success" | "danger" | "warning"
> = {
  paid: "success",
  debt: "danger",
  pending: "warning",
};

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const { playerId } = await params;
  const { year } = await searchParams;
  const selectedYear = parseYear(year);
  const decodedPlayerId = safeDecodeURIComponent(playerId);
  const profile = await getDataService().getPlayerProfile(decodedPlayerId, selectedYear);

  if (!profile) {
    notFound();
  }

  const encodedPlayerId = encodeURIComponent(profile.id);
  const currentPeriod = getCurrentPeriod();
  const currentMonth = profile.months.find((month) => month.period === currentPeriod);

  return (
    <main className="grid gap-6">
      <header className="grid gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <NavigationLink href="/" loadingMessage="Cargando dashboard...">
            <ArrowLeft />
            Volver
          </NavigationLink>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-muted-foreground text-sm font-medium">Ficha de jugador</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              {profile.name}
            </h1>
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span>{profile.category}</span>
              <span className="bg-border h-4 w-px" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-4" aria-hidden="true" />
                {profile.phone}
              </span>
            </div>
          </div>

          <ReminderButton
            playerName={profile.name}
            phone={profile.phone}
            feeAmount={currentMonth?.amount ?? "-"}
            size="default"
          />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="text-muted-foreground size-4" />
              Observaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{profile.observations}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="text-muted-foreground size-4" />
              Año de cuotas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" size="sm">
              <NavigationLink
                href={`/players/${encodedPlayerId}?year=${profile.year - 1}`}
                loadingMessage="Cargando año de cuotas..."
              >
                {profile.year - 1}
              </NavigationLink>
            </Button>
            <span className="text-xl font-semibold">{profile.year}</span>
            <Button asChild variant="outline" size="sm">
              <NavigationLink
                href={`/players/${encodedPlayerId}?year=${profile.year + 1}`}
                loadingMessage="Cargando año de cuotas..."
              >
                {profile.year + 1}
              </NavigationLink>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Todos los meses del año</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Cada mes puede marcarse como pagado o impago desde esta ficha.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {profile.months.map((month) => (
            <MonthCard key={month.period} month={month} playerId={profile.id} />
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="text-muted-foreground size-5" />
            Historial completo
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Registro de cuotas cargadas para el jugador.
          </p>
        </div>

        <HistoryTable history={profile.history} />
      </section>
    </main>
  );
}

function MonthCard({ month, playerId }: { month: PlayerYearMonth; playerId: string }) {
  const nextStatus: PlayerMonthPaymentStatus =
    month.status === "paid" ? "unpaid" : "paid";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base capitalize">{month.label}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">{month.period}</p>
          </div>
          <Badge variant={monthStatusVariants[month.status]}>
            {monthStatusLabels[month.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Info label="Cuota" value={month.amount} />
          <Info label="Vence" value={month.dueDate} />
          <Info label="Pago" value={month.paidAt} />
        </div>

        <form action={updatePlayerMonthStatus}>
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="period" value={month.period} />
          <input type="hidden" name="status" value={nextStatus} />
          <MonthStatusSubmitButton status={month.status} />
        </form>
      </CardContent>
    </Card>
  );
}

function HistoryTable({ history }: { history: PlayerFeeHistoryItem[] }) {
  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-center text-sm">
          Todavia no hay cuotas cargadas para este jugador.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60">
            <tr className="border-border border-b">
              <th className="text-muted-foreground h-12 px-4 text-left font-medium">
                Periodo
              </th>
              <th className="text-muted-foreground h-12 px-4 text-left font-medium">
                Monto
              </th>
              <th className="text-muted-foreground h-12 px-4 text-left font-medium">
                Estado
              </th>
              <th className="text-muted-foreground h-12 px-4 text-left font-medium">
                Vencimiento
              </th>
              <th className="text-muted-foreground h-12 px-4 text-left font-medium">
                Fecha de pago
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{item.period}</td>
                <td className="px-4 py-3">{item.amount}</td>
                <td className="px-4 py-3">
                  <Badge variant={historyStatusVariants[item.status]}>
                    {historyStatusLabels[item.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3">{item.dueDate}</td>
                <td className="px-4 py-3">{item.paidAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function parseYear(value?: string) {
  const parsed = Number(value);
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    return currentYear;
  }

  return parsed;
}

function getCurrentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
