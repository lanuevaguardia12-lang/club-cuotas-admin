import { redirect } from "next/navigation";
import { AlertTriangle, ScrollText, ShieldCheck } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, roleLabels } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export default async function AuditPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "audit:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Panel de auditoria"
        description="Tu rol no tiene permisos para revisar auditoria y logs."
      />
    );
  }

  const premium = await getDataService().getPremiumData();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Premium</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Panel de auditoria
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Historial de cambios, eventos del sistema, webhooks, API y errores operativos.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Eventos"
          value={premium.summary.auditEvents}
          detail="Historial de cambios"
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Logs"
          value={premium.logs.length}
          detail="Eventos tecnicos"
          icon={<ScrollText className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Errores"
          value={premium.summary.errorLogs}
          detail="Requieren revision"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Historial de cambios</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {premium.audit.slice(0, 20).map((event) => (
              <div
                key={event.id}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{event.summary}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {event.action} · {event.entityType}:{event.entityId}
                    </p>
                  </div>
                  <Badge variant="secondary">{formatActorRole(event.actor.role)}</Badge>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  {formatDateTime(event.timestamp)} · {event.actor.name}
                </p>
              </div>
            ))}
            {premium.audit.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay eventos registrados.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {premium.logs.slice(0, 20).map((log) => (
              <div key={log.id} className="border-border rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{log.message}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{log.source}</p>
                  </div>
                  <Badge
                    variant={
                      log.level === "error"
                        ? "danger"
                        : log.level === "warning"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {log.level}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  {formatDateTime(log.timestamp)}
                </p>
              </div>
            ))}
            {premium.logs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay logs registrados.</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {premium.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {premium.source.message}
        </section>
      ) : null}
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

function formatActorRole(role: keyof typeof roleLabels | "api" | "system") {
  if (role === "api") {
    return "API";
  }

  if (role === "system") {
    return "Sistema";
  }

  return roleLabels[role];
}
