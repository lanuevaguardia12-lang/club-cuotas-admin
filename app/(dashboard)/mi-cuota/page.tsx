import { redirect } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  ListChecks,
  XCircle,
} from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { PushNotificationPanel } from "@/components/push/push-notification-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";
import type {
  PlayerMonthMatchSummary,
  PlayerMonthPaymentStatus,
} from "@/types/dashboard";

export const dynamic = "force-dynamic";

interface MyFeePageProps {
  searchParams: Promise<{
    year?: string;
  }>;
}

const monthStatusLabels: Record<PlayerMonthPaymentStatus, string> = {
  paid: "Pagada",
  unpaid: "Pendiente",
};

const monthStatusVariants: Record<PlayerMonthPaymentStatus, "success" | "danger"> = {
  paid: "success",
  unpaid: "danger",
};

const PAYMENT_FORM_BASE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScNPtChGadjifgrXFRZjDYsMVaIniB-EIRRvKfT4SAGKhqfuA/viewform";

export default async function MyFeePage({ searchParams }: MyFeePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/mi-cuota");
  }

  const playerLookups = getPlayerLookupCandidates(user);

  if (user.role !== "player" || playerLookups.length === 0) {
    return (
      <EmptySection
        eyebrow="Acceso de jugador"
        title="Mi cuota"
        description="Esta vista esta pensada para usuarios jugadores asociados a un jugador del plantel."
      />
    );
  }

  const params = await searchParams;
  const selectedYear = parseYear(params.year);
  const profile = await findPlayerProfile(playerLookups, selectedYear);

  if (!profile) {
    return (
      <EmptySection
        eyebrow="Jugador no encontrado"
        title="Mi cuota"
        description="No encontramos un jugador asociado a este usuario. Revisá que el playerId o el nombre configurado en AUTH_USERS_JSON coincida con el ABM de jugadores."
      />
    );
  }

  const currentPeriod = getCurrentPeriod();
  const currentMonth =
    profile.months.find((month) => month.period === currentPeriod) ??
    profile.months.find((month) => month.period.endsWith(`-${currentPeriod.slice(5)}`));
  const pendingMonths = profile.months.filter((month) => month.status === "unpaid");

  return (
    <main className="grid gap-6">
      <header className="grid gap-2">
        <p className="text-muted-foreground text-sm font-medium">Jugador</p>
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Mi cuota</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Estado personal de cuotas, historial anual y avisos push del club.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeDollarSign className="text-primary size-5" />
              {profile.name}
            </CardTitle>
            <p className="text-muted-foreground text-sm">{profile.category}</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                label="Cuota actual"
                value={currentMonth?.amount ?? "-"}
                detail={currentMonth ? formatPeriod(currentMonth.period) : "Sin datos"}
              />
              <Metric
                label="Estado"
                value={
                  currentMonth ? monthStatusLabels[currentMonth.status] : "Sin datos"
                }
                detail={currentMonth?.paidAt || currentMonth?.dueDate || "-"}
                tone={currentMonth?.status === "paid" ? "success" : "danger"}
              />
              <Metric
                label="Pendientes"
                value={String(pendingMonths.length)}
                detail={`Año ${profile.year}`}
                tone={pendingMonths.length > 0 ? "danger" : "success"}
              />
            </div>
            {currentMonth?.matchSummary ? (
              <CurrentQuotaAttendanceSummary
                currentPeriod={currentMonth.period}
                summary={currentMonth.matchSummary}
              />
            ) : null}
            {currentMonth?.status === "unpaid" ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">¿Ya hiciste el pago?</p>
                  <p className="text-muted-foreground text-xs">
                    Abrí el formulario precargado para {formatPeriod(currentMonth.period)}
                    .
                  </p>
                </div>
                <PaymentFormButton
                  period={currentMonth.period}
                  playerName={profile.name}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <PushNotificationPanel playerId={profile.id} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="text-muted-foreground size-4" />
            Cuotas {profile.year}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {profile.months.map((month) => {
            const Icon = month.status === "paid" ? CheckCircle2 : XCircle;

            return (
              <article
                key={month.period}
                className="border-border bg-background grid gap-3 rounded-md border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{formatPeriod(month.period)}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {month.amount} · vence {month.dueDate}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {month.amountSource === "calculator"
                        ? "Monto tomado del calculador de cuota."
                        : month.amountSource === "payments"
                          ? "Monto tomado del registro de cuotas."
                          : "Sin monto calculado para este mes."}
                    </p>
                    {month.paidAt ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Pagada el {month.paidAt}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={monthStatusVariants[month.status]} className="gap-1.5">
                    <Icon className="size-3.5" />
                    {monthStatusLabels[month.status]}
                  </Badge>
                </div>
                {month.matchSummary ? (
                  <MonthMatchSummary summary={month.matchSummary} />
                ) : null}
                {month.status === "unpaid" ? (
                  <PaymentFormButton
                    className="w-full"
                    period={month.period}
                    playerName={profile.name}
                  />
                ) : null}
              </article>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="text-muted-foreground size-4" />
            Historial
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {profile.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin historial registrado.</p>
          ) : (
            profile.history.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="border-border bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span>{formatPeriod(item.period)}</span>
                <span className="font-medium">{item.amount}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function PaymentFormButton({
  className,
  period,
  playerName,
}: {
  className?: string;
  period: string;
  playerName: string;
}) {
  return (
    <Button asChild className={className} size="sm">
      <a href={buildPaymentFormUrl(playerName, period)} rel="noreferrer" target="_blank">
        <ExternalLink className="size-4" />
        Registrar pago
      </a>
    </Button>
  );
}

function MonthMatchSummary({ summary }: { summary: PlayerMonthMatchSummary }) {
  return (
    <div className="border-border bg-muted/30 rounded-md border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="text-primary size-4" />
            Asistencia de {formatPeriod(summary.evaluatedPeriod)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {summary.playedMatches}/{summary.totalMatches} partidos ·{" "}
            {formatPercent(summary.attendanceRate)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs">
        <MatchList
          emptyText="Sin partidos presentes."
          matches={summary.presentMatches}
          title="Estuvo"
        />
        <MatchList
          emptyText="Sin partidos ausentes."
          matches={summary.absentMatches}
          title="No estuvo"
        />
      </div>
    </div>
  );
}

function CurrentQuotaAttendanceSummary({
  currentPeriod,
  summary,
}: {
  currentPeriod: string;
  summary: PlayerMonthMatchSummary;
}) {
  return (
    <div className="border-primary/20 bg-primary/5 rounded-md border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="text-primary size-4" />
            Asistencia aplicada a {formatPeriod(currentPeriod)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Se toma {formatPeriod(summary.evaluatedPeriod)}: {summary.playedMatches}/
            {summary.totalMatches} partidos · {formatPercent(summary.attendanceRate)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <MatchList
          emptyText="Sin partidos presentes."
          matches={summary.presentMatches}
          title="Estuvo"
        />
        <MatchList
          emptyText="Sin partidos ausentes."
          matches={summary.absentMatches}
          title="No estuvo"
        />
      </div>
    </div>
  );
}

function MatchList({
  emptyText,
  matches,
  title,
}: {
  emptyText: string;
  matches: Array<{ date: string; rival: string }>;
  title: string;
}) {
  return (
    <details>
      <summary className="text-primary cursor-pointer list-none font-medium">
        {title} ({matches.length})
      </summary>
      <div className="mt-1 grid gap-1">
        {matches.length > 0 ? (
          matches.map((match) => (
            <p key={`${match.date}-${match.rival}`} className="text-muted-foreground">
              {formatShortDate(match.date)} · {match.rival}
            </p>
          ))
        ) : (
          <p className="text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </details>
  );
}

async function findPlayerProfile(playerLookups: string[], year?: number) {
  const dataService = getDataService();

  for (const lookup of playerLookups) {
    const profile = await dataService.getPlayerProfile(lookup, year);

    if (profile) {
      return profile;
    }
  }

  return null;
}

function getPlayerLookupCandidates(user: AuthUser) {
  return Array.from(
    new Set(
      [user.playerId, user.id, user.username, user.name]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function Metric({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "neutral" | "success" | "danger";
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="border-border bg-background rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}

function parseYear(year?: string) {
  const parsed = Number(year);

  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100
    ? parsed
    : undefined;
}

function getCurrentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildPaymentFormUrl(playerName: string, period: string) {
  const [year] = period.split("-");
  const params = new URLSearchParams({
    usp: "pp_url",
    "entry.1447717655": playerName,
    "entry.2143604901": year,
    "entry.639910438": formatFormMonth(period),
  });

  return `${PAYMENT_FORM_BASE_URL}?${params.toString()}`;
}

function formatFormMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
