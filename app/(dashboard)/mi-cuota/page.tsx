import { redirect } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  History,
  ListChecks,
  XCircle,
} from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import {
  FormsRefreshButton,
  MyFeePullToRefresh,
} from "@/components/players/my-fee-refresh";
import { PaymentAliasCopyButton } from "@/components/players/payment-alias-copy-button";
import { PaymentFormButton } from "@/components/players/payment-form-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import {
  findPlayerProfileForUser,
  formatPeriod,
  getCurrentPeriod,
  getPlayerLookupCandidates,
  parseYear,
} from "@/lib/player-profile";
import { getDataService } from "@/services/data-service";
import type {
  PlayerMonthMatchSummary,
  PlayerMonthPaymentStatus,
  PlayerYearMonth,
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
  const dataService = getDataService();
  const [profile, settingsData] = await Promise.all([
    findPlayerProfileForUser(user, selectedYear),
    dataService.getAppSettings(),
  ]);

  if (!profile) {
    return (
      <EmptySection
        eyebrow="Jugador no encontrado"
        title="Mi cuota"
        description="No encontramos un jugador asociado a este usuario. Revisá que el playerId o el nombre configurado en AUTH_USERS_JSON coincida con el ABM de jugadores."
      />
    );
  }

  const paymentAlias = settingsData.settings.paymentAlias;
  const currentPeriod = getCurrentPeriod();
  const currentMonth =
    profile.months.find((month) => month.period === currentPeriod) ??
    profile.months.find((month) => month.period.endsWith(`-${currentPeriod.slice(5)}`));
  const sortedMonths = [...profile.months].sort((left, right) =>
    left.period.localeCompare(right.period),
  );
  const focusedPeriod = currentMonth?.period ?? currentPeriod;
  const previousMonth = findPreviousMonth(sortedMonths, focusedPeriod);
  const nextMonth = findNextMonth(sortedMonths, focusedPeriod);
  const pendingMonths = profile.months.filter((month) =>
    isPayablePendingMonth(month, currentPeriod),
  );
  const pendingHistoricalMonths = sortedMonths.filter(
    (month) =>
      isPayablePendingMonth(month, currentPeriod) &&
      month.period !== currentMonth?.period,
  );

  return (
    <main className="grid gap-6">
      <MyFeePullToRefresh />
      <header className="grid gap-2">
        <p className="text-muted-foreground text-sm font-medium">Jugador</p>
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Mi cuota</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Estado personal de cuotas, historial anual y avisos push del club.
        </p>
      </header>

      <section className="grid gap-4">
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
                detail={
                  currentMonth
                    ? currentMonth.quotaStatus === "undefined"
                      ? `Monto parcial · ${formatPeriod(currentMonth.period)}`
                      : formatPeriod(currentMonth.period)
                    : "Sin datos"
                }
              />
              <Metric
                label="Estado"
                value={
                  currentMonth
                    ? currentMonth.quotaStatus === "undefined"
                      ? "Cuota sin definir"
                      : monthStatusLabels[currentMonth.status]
                    : "Sin datos"
                }
                detail={
                  currentMonth?.quotaStatus === "undefined"
                    ? currentMonth.quotaStatusReason || "Faltan datos del calculador."
                    : currentMonth?.paidAt || currentMonth?.dueDate || "-"
                }
                tone={
                  currentMonth?.quotaStatus === "undefined"
                    ? "warning"
                    : currentMonth?.status === "paid"
                      ? "success"
                      : "danger"
                }
              />
              <Metric
                label="Pendientes"
                value={pendingMonths.length > 0 ? String(pendingMonths.length) : "Al día"}
                detail={
                  pendingMonths.length > 0
                    ? "Cuotas definidas sin pagar"
                    : "Sin cuotas pendientes"
                }
                tone={pendingMonths.length > 0 ? "danger" : "success"}
              />
            </div>
            {currentMonth?.matchSummary ? (
              <CurrentQuotaAttendanceSummary
                currentPeriod={currentMonth.period}
                summary={currentMonth.matchSummary}
              />
            ) : null}
            <PaymentAliasPanel alias={paymentAlias} />
            {currentMonth?.quotaStatus === "undefined" ? (
              <UndefinedQuotaNotice month={currentMonth} />
            ) : currentMonth?.status === "unpaid" ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">¿Ya hiciste el pago?</p>
                  <p className="text-muted-foreground text-xs">
                    Abrí el formulario precargado para {formatPeriod(currentMonth.period)}
                    .
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <PaymentFormButton
                    period={currentMonth.period}
                    playerName={profile.name}
                  />
                  <FormsRefreshButton />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <MonthPreviewCard
          currentPeriod={currentPeriod}
          emptyText="No hay una cuota posterior cargada."
          icon="next"
          month={nextMonth}
          title="Siguiente cuota"
        />
        <MonthPreviewCard
          currentPeriod={currentPeriod}
          emptyText="No hay una cuota anterior cargada."
          icon="previous"
          month={previousMonth}
          title="Cuota anterior"
        />
      </section>

      <HistoricalMonthsCard
        currentPeriod={currentMonth?.period}
        months={sortedMonths}
        pendingCount={pendingHistoricalMonths.length}
        paymentAlias={paymentAlias}
        playerName={profile.name}
        year={profile.year}
      />
    </main>
  );
}

function PaymentAliasPanel({ alias }: { alias?: string | null }) {
  const paymentAlias = alias?.trim();

  if (!paymentAlias) {
    return null;
  }

  return (
    <div className="border-primary/20 bg-primary/5 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Alias para transferir</p>
        <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
          {paymentAlias}
        </p>
      </div>
      <PaymentAliasCopyButton alias={paymentAlias} className="w-full sm:w-auto" />
    </div>
  );
}

function MonthPreviewCard({
  currentPeriod,
  emptyText,
  icon,
  month,
  title,
}: {
  currentPeriod: string;
  emptyText: string;
  icon: "next" | "previous";
  month?: PlayerYearMonth;
  title: string;
}) {
  const Icon = icon === "next" ? CalendarClock : CalendarDays;

  return (
    <Card className="club-animate-fade-up">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="text-primary size-4" />
            {title}
          </CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {month ? formatPeriod(month.period) : emptyText}
          </p>
        </div>
        {month ? <MonthStatusBadge currentPeriod={currentPeriod} month={month} /> : null}
      </CardHeader>
      <CardContent>
        {month ? (
          <div className="grid gap-3">
            <p className="text-2xl font-semibold">{month.amount}</p>
            <div className="grid gap-1 text-sm">
              {month.quotaStatus === "undefined" ? (
                <p className="text-muted-foreground">Monto parcial</p>
              ) : null}
              <p className="text-muted-foreground">Vence {month.dueDate}</p>
              {month.paidAt ? (
                <p className="text-muted-foreground">Pagada el {month.paidAt}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sin datos para mostrar.</p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricalMonthsCard({
  currentPeriod,
  months,
  pendingCount,
  paymentAlias,
  playerName,
  year,
}: {
  currentPeriod?: string;
  months: PlayerYearMonth[];
  pendingCount: number;
  paymentAlias?: string | null;
  playerName: string;
  year: number;
}) {
  const todayPeriod = getCurrentPeriod();

  return (
    <Card>
      <details className="group">
        <summary className="cursor-pointer list-none">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="text-primary size-4" />
                Histórico {year}
              </CardTitle>
              <p className="text-muted-foreground mt-2 text-sm">
                {months.length} cuotas del año disponibles para consultar.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {pendingCount > 0 ? (
                <Badge variant="warning">{pendingCount} pendientes</Badge>
              ) : (
                <Badge variant="success">Al día</Badge>
              )}
              <ChevronDown
                className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </div>
          </CardHeader>
        </summary>
        <CardContent className="grid gap-2">
          {months.map((month) => (
            <MonthHistoryRow
              current={month.period === currentPeriod}
              currentPeriod={todayPeriod}
              key={month.period}
              month={month}
              paymentAlias={paymentAlias}
              playerName={playerName}
            />
          ))}
        </CardContent>
      </details>
    </Card>
  );
}

function MonthHistoryRow({
  current,
  currentPeriod,
  month,
  paymentAlias,
  playerName,
}: {
  current: boolean;
  currentPeriod: string;
  month: PlayerYearMonth;
  paymentAlias?: string | null;
  playerName: string;
}) {
  const canPayMonth = isPayablePendingMonth(month, currentPeriod);
  const Icon = month.status === "paid" ? CheckCircle2 : XCircle;
  const iconTone = getMonthIconTone(month, currentPeriod);

  return (
    <article className="border-border bg-background grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <div
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${iconTone}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium capitalize">{formatPeriod(month.period)}</p>
            {current ? <Badge variant="outline">Actual</Badge> : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {month.amount} · vence {month.dueDate}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {getMonthAmountSourceLabel(month)}
          </p>
          {month.paidAt ? (
            <p className="text-muted-foreground mt-1 text-xs">Pagada el {month.paidAt}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <MonthStatusBadge currentPeriod={currentPeriod} month={month} />
        {canPayMonth ? (
          <>
            <PaymentAliasCopyButton alias={paymentAlias} size="sm" />
            <PaymentFormButton compact period={month.period} playerName={playerName} />
          </>
        ) : null}
      </div>
    </article>
  );
}

function getMonthIconTone(month: PlayerYearMonth, currentPeriod: string) {
  if (month.status === "paid") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (month.period > currentPeriod) {
    return "bg-muted text-muted-foreground";
  }

  if (month.quotaStatus === "undefined") {
    return "bg-[#f4ce0f]/10 text-[#8a7200] dark:text-[#f4ce0f]";
  }

  return "bg-destructive/10 text-destructive";
}

function isPayablePendingMonth(month: PlayerYearMonth, currentPeriod: string) {
  return (
    month.period <= currentPeriod &&
    month.status === "unpaid" &&
    month.quotaStatus === "defined" &&
    month.amountValue > 0
  );
}

function MonthStatusBadge({
  currentPeriod,
  month,
}: {
  currentPeriod: string;
  month: PlayerYearMonth;
}) {
  if (month.period > currentPeriod && month.status === "unpaid") {
    return <Badge variant="outline">Cuota futura</Badge>;
  }

  if (month.quotaStatus === "undefined") {
    return <Badge variant="warning">Cuota sin definir</Badge>;
  }

  const Icon = month.status === "paid" ? CheckCircle2 : XCircle;

  return (
    <Badge variant={monthStatusVariants[month.status]} className="gap-1.5">
      <Icon className="size-3.5" />
      {monthStatusLabels[month.status]}
    </Badge>
  );
}

function UndefinedQuotaNotice({ month }: { month: PlayerYearMonth }) {
  return (
    <div className="grid gap-2 rounded-md border border-dashed border-[#f4ce0f]/50 bg-[#f4ce0f]/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Cuota sin definir</p>
          <p className="text-muted-foreground mt-1 text-xs">
            El monto mostrado para {formatPeriod(month.period)} es parcial. Todavía no
            conviene registrar el pago hasta cerrar costos y ajustes reales.
          </p>
        </div>
        <Badge variant="warning">Monto parcial</Badge>
      </div>
      {month.quotaStatusReason ? (
        <p className="text-muted-foreground text-xs">{month.quotaStatusReason}</p>
      ) : null}
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

function findPreviousMonth(months: PlayerYearMonth[], period: string) {
  return [...months].reverse().find((month) => month.period < period);
}

function findNextMonth(months: PlayerYearMonth[], period: string) {
  return months.find((month) => month.period > period);
}

function getMonthAmountSourceLabel(month: PlayerYearMonth) {
  if (month.amountSource === "calculator") {
    return "Monto tomado del calculador de cuota.";
  }

  if (month.amountSource === "payments") {
    return "Monto tomado del registro de cuotas.";
  }

  return "Sin monto calculado para este mes.";
}

function Metric({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "neutral" | "success" | "danger" | "warning";
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-[#8a7200] dark:text-[#f4ce0f]"
          : "text-foreground";

  return (
    <div className="border-border bg-background rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
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
