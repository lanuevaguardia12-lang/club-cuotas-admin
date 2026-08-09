import { redirect } from "next/navigation";
import { Bell, Clock3, MessageCircleWarning, Send } from "lucide-react";

import { markNotificationReadAction } from "@/app/(dashboard)/notifications/actions";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, roleLabels } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "notifications:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Notificaciones"
        description="Tu rol no tiene permisos para administrar notificaciones y recordatorios."
      />
    );
  }

  const premium = await getDataService().getPremiumData();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Premium</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Notificaciones y recordatorios
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Centro de avisos internos, cola de recordatorios automaticos y seguimiento de
          envios.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="No leidas"
          value={premium.summary.unreadNotifications}
          detail="Avisos pendientes"
          icon={<Bell className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="En cola"
          value={premium.summary.queuedReminders}
          detail="Recordatorios preparados"
          icon={<Clock3 className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Fallidos"
          value={premium.summary.failedReminders}
          detail="Requieren revision"
          icon={<MessageCircleWarning className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notificaciones</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {premium.notifications.slice(0, 20).map((notification) => (
              <div
                key={notification.id}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {notification.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        notification.type === "danger"
                          ? "danger"
                          : notification.type === "warning"
                            ? "warning"
                            : notification.type === "success"
                              ? "success"
                              : "secondary"
                      }
                    >
                      {notification.status}
                    </Badge>
                    <Badge variant="outline">
                      {notification.targetRole === "all"
                        ? "Todos"
                        : roleLabels[notification.targetRole]}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(notification.createdAt)}
                  </p>
                  {notification.status === "unread" ? (
                    <form action={markNotificationReadAction}>
                      <input
                        type="hidden"
                        name="notificationId"
                        value={notification.id}
                      />
                      <Button size="sm" variant="outline">
                        Marcar leida
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
            {premium.notifications.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay notificaciones registradas.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recordatorios automaticos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {premium.reminders.slice(0, 20).map((reminder) => (
              <div key={reminder.id} className="border-border rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{reminder.playerName}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {reminder.period} · {reminder.phone}
                    </p>
                  </div>
                  <Badge
                    variant={
                      reminder.status === "failed"
                        ? "danger"
                        : reminder.status === "sent"
                          ? "success"
                          : "warning"
                    }
                  >
                    {reminder.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-2 text-sm">
                  {reminder.message}
                </p>
                <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
                  <Send className="size-3" aria-hidden="true" />
                  Programado: {formatDateTime(reminder.scheduledFor)}
                </p>
              </div>
            ))}
            {premium.reminders.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay recordatorios enviados todavía. Los crons de cuotas y MVP los
                registrarán automaticamente cuando correspondan.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
