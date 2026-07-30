import { redirect } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { PushNotificationPanel } from "@/components/push/push-notification-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { PlayerMonthPaymentStatus } from "@/types/dashboard";

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

  if (user.role !== "player" || !user.playerId) {
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
  const profile = await getDataService().getPlayerProfile(user.playerId, selectedYear);

  if (!profile) {
    return (
      <EmptySection
        eyebrow="Jugador no encontrado"
        title="Mi cuota"
        description="No encontramos un jugador asociado a este usuario. Revisá el playerId configurado en AUTH_USERS_JSON."
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
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Cuota actual"
              value={currentMonth?.amount ?? "-"}
              detail={currentMonth ? formatPeriod(currentMonth.period) : "Sin datos"}
            />
            <Metric
              label="Estado"
              value={currentMonth ? monthStatusLabels[currentMonth.status] : "Sin datos"}
              detail={currentMonth?.paidAt || currentMonth?.dueDate || "-"}
              tone={currentMonth?.status === "paid" ? "success" : "danger"}
            />
            <Metric
              label="Pendientes"
              value={String(pendingMonths.length)}
              detail={`Año ${profile.year}`}
              tone={pendingMonths.length > 0 ? "danger" : "success"}
            />
          </CardContent>
        </Card>

        <PushNotificationPanel />
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
                className="border-border bg-background flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium capitalize">{formatPeriod(month.period)}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {month.amount} · vence {month.dueDate}
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
