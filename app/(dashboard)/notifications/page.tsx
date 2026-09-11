import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  MessageCircleWarning,
} from "lucide-react";

import { markNotificationReadAction } from "@/app/(dashboard)/notifications/actions";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
import type { AppNotification, NotificationDeliveryStatus } from "@/types/premium";
import type { PlayerDirectoryItem } from "@/types/players";

export const dynamic = "force-dynamic";

type NotificationAuditType = "all" | "fee" | "mvp" | "upcoming-match";
type NotificationAuditStatus =
  "all" | "created" | "failed" | "no_subscription" | "sent" | "skipped";

interface NotificationsPageProps {
  searchParams: Promise<{
    estado?: string;
    tipo?: string;
  }>;
}

interface NotificationAuditRow {
  attempts: number;
  createdAt: string;
  detail: string;
  error?: string;
  group: NotificationAuditType;
  id: string;
  notification: AppNotification;
  playerId: string;
  playerName: string;
  referenceId: string;
  status: NotificationDeliveryStatus;
  title: string;
  typeLabel: string;
  userId: string;
}

const typeFilters: Array<{ label: string; value: NotificationAuditType }> = [
  { label: "Todas", value: "all" },
  { label: "Próximo partido", value: "upcoming-match" },
  { label: "Cuotas", value: "fee" },
  { label: "MVP", value: "mvp" },
];

const statusFilters: Array<{ label: string; value: NotificationAuditStatus }> = [
  { label: "Todos", value: "all" },
  { label: "Enviadas", value: "sent" },
  { label: "Fallidas", value: "failed" },
  { label: "Sin dispositivo", value: "no_subscription" },
  { label: "Registradas", value: "created" },
  { label: "Omitidas", value: "skipped" },
];

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Notificaciones"
        description="Solo un administrador puede ver el estado de las notificaciones."
      />
    );
  }

  const params = await searchParams;
  const selectedType = parseTypeFilter(params.tipo);
  const selectedStatus = parseStatusFilter(params.estado);
  const dataService = getDataService();
  const [premium, playersData, accounts] = await Promise.all([
    dataService.getPremiumData(),
    dataService.getPlayersData().catch(() => null),
    dataService.getAccountUsers().catch(() => [] as AccountUser[]),
  ]);
  const rows = buildNotificationAuditRows(
    premium.notifications,
    playersData?.players ?? [],
    accounts,
  );
  const filteredRows = rows.filter(
    (row) =>
      (selectedType === "all" || row.group === selectedType) &&
      (selectedStatus === "all" || row.status === selectedStatus),
  );
  const sentCount = rows.filter((row) => row.status === "sent").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const noSubscriptionCount = rows.filter(
    (row) => row.status === "no_subscription",
  ).length;

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Notificaciones
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Estado de envíos por jugador para próximo partido, cuotas y votación MVP.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <MetricCard
          title="Registros"
          value={rows.length}
          detail="Registros guardados"
          icon={<Bell className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Enviadas"
          value={sentCount}
          detail="Push confirmado"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Fallidas"
          value={failedCount}
          detail="Error de entrega"
          icon={<CircleAlert className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Sin dispositivo"
          value={noSubscriptionCount}
          detail="No hay push activo"
          icon={<MessageCircleWarning className="size-4" aria-hidden="true" />}
        />
      </section>

      <Card>
        <CardHeader className="grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="text-primary size-5" aria-hidden="true" />
              Estado de notificaciones
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Mostrando {filteredRows.length} de {rows.length}
            </p>
          </div>
          <div className="grid gap-3">
            <FilterBar
              label="Tipo"
              items={typeFilters.map((item) => ({
                active: item.value === selectedType,
                href: buildFilterHref(item.value, selectedStatus),
                label: item.label,
              }))}
            />
            <FilterBar
              label="Estado"
              items={statusFilters.map((item) => ({
                active: item.value === selectedStatus,
                href: buildFilterHref(selectedType, item.value),
                label: item.label,
              }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredRows.length > 0 ? (
            <div className="border-border overflow-x-auto rounded-md border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Jugador</th>
                    <th className="px-3 py-2 text-left font-semibold">ID jugador</th>
                    <th className="px-3 py-2 text-left font-semibold">Usuario</th>
                    <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-left font-semibold">Detalle</th>
                    <th className="px-3 py-2 text-left font-semibold">Estado</th>
                    <th className="px-3 py-2 text-center font-semibold">Intentos</th>
                    <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-2 text-left font-semibold">Error</th>
                    <th className="px-3 py-2 text-right font-semibold">Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 250).map((row) => (
                    <tr key={row.id} className="border-border border-t">
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium">{row.playerName}</p>
                        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                          {row.title}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs">
                        {row.playerId}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-xs">
                        {row.userId}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant="outline">{row.typeLabel}</Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className="max-w-72">{row.detail}</p>
                        {row.referenceId ? (
                          <p className="text-muted-foreground mt-1 line-clamp-1 font-mono text-[0.68rem]">
                            {row.referenceId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant={getDeliveryStatusVariant(row.status)}>
                          {getDeliveryStatusLabel(row.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center align-top">{row.attempts}</td>
                      <td className="px-3 py-2 align-top">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="text-muted-foreground line-clamp-2 max-w-64 text-xs">
                          {row.error || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        {row.notification.status === "unread" ? (
                          <form action={markNotificationReadAction}>
                            <input
                              type="hidden"
                              name="notificationId"
                              value={row.notification.id}
                            />
                            <Button size="sm" variant="outline">
                              Marcar leída
                            </Button>
                          </form>
                        ) : (
                          <Badge variant="secondary">{row.notification.status}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length > 250 ? (
                <p className="text-muted-foreground border-border border-t px-3 py-2 text-xs">
                  Se muestran los últimos 250 registros del filtro.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid place-items-center py-12 text-center">
              <Clock3 className="text-muted-foreground size-8" aria-hidden="true" />
              <p className="mt-3 font-medium">Sin registros para este filtro</p>
              <p className="text-muted-foreground mt-1 max-w-md text-sm">
                Los próximos envíos van a guardar estado por jugador, partido o mes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function MetricCard({
  detail,
  icon,
  title,
  value,
}: Readonly<{
  detail: string;
  icon: React.ReactNode;
  title: string;
  value: number;
}>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
        <div className="bg-primary/10 text-primary rounded-md p-2">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function FilterBar({
  items,
  label,
}: {
  items: Array<{ active: boolean; href: string; label: string }>;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold uppercase">
        {label}
      </span>
      {items.map((item) => (
        <Button
          key={item.href}
          asChild
          size="sm"
          variant={item.active ? "default" : "outline"}
        >
          <Link href={item.href}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function buildNotificationAuditRows(
  notifications: AppNotification[],
  players: PlayerDirectoryItem[],
  accounts: AccountUser[],
) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const accountsByUserId = new Map(accounts.map((account) => [account.userId, account]));
  const accountsByPlayerId = new Map(
    accounts.flatMap((account) =>
      account.playerId ? [[account.playerId, account] as const] : [],
    ),
  );

  return notifications
    .map((notification): NotificationAuditRow => {
      const group = getAuditTypeGroup(notification);
      const parsed = parseNotificationReference(notification);
      const userId =
        notification.recipientUserId ?? notification.targetUserId ?? parsed.userId ?? "-";
      const playerId =
        notification.recipientPlayerId ??
        notification.targetPlayerId ??
        parsed.playerId ??
        accountsByUserId.get(userId)?.playerId ??
        "-";
      const account =
        accountsByUserId.get(userId) ??
        (playerId !== "-" ? accountsByPlayerId.get(playerId) : undefined);
      const player = playerId !== "-" ? playersById.get(playerId) : undefined;

      return {
        attempts: notification.deliveryAttempts ?? 0,
        createdAt: notification.createdAt,
        detail: buildNotificationDetail(notification, parsed),
        error: notification.deliveryError,
        group,
        id: notification.id,
        notification,
        playerId,
        playerName:
          notification.recipientName ?? account?.name ?? player?.name ?? "Sin jugador",
        referenceId: notification.referenceId ?? "",
        status: notification.deliveryStatus,
        title: notification.title,
        typeLabel: getNotificationTypeLabel(notification),
        userId,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
}

function parseNotificationReference(notification: AppNotification) {
  const referenceId = notification.referenceId ?? "";
  const parts = referenceId.split(":");

  if (parts[0] === "upcoming-match") {
    return {
      detail: `${parts[2] || "Fecha"} · ${(parts[3] || "").toUpperCase()} · vs ${humanizeReferenceSegment(parts[4])}`,
      playerId: undefined,
      userId: parts[1],
    };
  }

  if (parts[0] === "fee-defined" || parts[0] === "fee-reminder") {
    return {
      detail: `Mes ${formatPeriod(notification.period ?? parts[2] ?? "")}`,
      playerId: parts[1],
      userId: undefined,
    };
  }

  if (parts[0] === "mvp") {
    const isLegacy = parts.length === 3;
    const userId = isLegacy ? parts[1] : parts[2];
    const matchId = isLegacy ? parts[2] : parts[3];

    return {
      detail: matchId ? `Partido ${matchId}` : "Partido MVP",
      playerId: undefined,
      userId,
    };
  }

  return {
    detail: notification.message,
    playerId: undefined,
    userId: undefined,
  };
}

function buildNotificationDetail(
  notification: AppNotification,
  parsed: ReturnType<typeof parseNotificationReference>,
) {
  if (notification.matchLabel) {
    return notification.matchLabel;
  }

  if (notification.period) {
    return `Mes ${formatPeriod(notification.period)}`;
  }

  return parsed.detail || notification.message;
}

function getAuditTypeGroup(notification: AppNotification): NotificationAuditType {
  if (
    notification.notificationKind === "fee-defined" ||
    notification.notificationKind === "fee-reminder"
  ) {
    return "fee";
  }

  if (notification.notificationKind === "mvp") {
    return "mvp";
  }

  if (notification.notificationKind === "upcoming-match") {
    return "upcoming-match";
  }

  return "all";
}

function getNotificationTypeLabel(notification: AppNotification) {
  if (notification.notificationKind === "upcoming-match") {
    return "Próximo partido";
  }

  if (notification.notificationKind === "fee-defined") {
    return "Cuota definida";
  }

  if (notification.notificationKind === "fee-reminder") {
    return "Cuota vencida";
  }

  if (notification.notificationKind === "mvp") {
    return "Votar MVP";
  }

  return "Otra";
}

function parseTypeFilter(value: string | undefined): NotificationAuditType {
  if (value === "fee" || value === "mvp" || value === "upcoming-match") {
    return value;
  }

  return "all";
}

function parseStatusFilter(value: string | undefined): NotificationAuditStatus {
  if (
    value === "created" ||
    value === "failed" ||
    value === "no_subscription" ||
    value === "sent" ||
    value === "skipped"
  ) {
    return value;
  }

  return "all";
}

function buildFilterHref(tipo: NotificationAuditType, estado: NotificationAuditStatus) {
  const params = new URLSearchParams();

  if (tipo !== "all") {
    params.set("tipo", tipo);
  }

  if (estado !== "all") {
    params.set("estado", estado);
  }

  const query = params.toString();

  return query ? `/notifications?${query}` : "/notifications";
}

function getDeliveryStatusLabel(status: NotificationDeliveryStatus) {
  const labels: Record<NotificationDeliveryStatus, string> = {
    created: "Registrada",
    failed: "Falló",
    no_subscription: "Sin dispositivo",
    sent: "Enviada",
    skipped: "Omitida",
  };

  return labels[status];
}

function getDeliveryStatusVariant(status: NotificationDeliveryStatus) {
  if (status === "sent") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "no_subscription" || status === "skipped") {
    return "warning";
  }

  return "secondary";
}

function humanizeReferenceSegment(value: string | undefined) {
  if (!value) {
    return "-";
  }

  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPeriod(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return period || "-";
  }

  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
