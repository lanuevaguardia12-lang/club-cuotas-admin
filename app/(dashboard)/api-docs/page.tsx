import { redirect } from "next/navigation";
import { Code2, KeyRound, Link2, Webhook } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

const restEndpoints = [
  ["GET", "/api/v1/dashboard", "Metricas y jugadores del dashboard"],
  ["GET", "/api/v1/cash-flow", "Ingresos, gastos, balance y saldo"],
  ["GET", "/api/v1/players", "Listado de jugadores"],
  ["GET", "/api/v1/players/{playerId}", "Ficha e historial de jugador"],
  ["GET", "/api/v1/audit", "Auditoria, logs, notificaciones, pagos y recordatorios"],
  ["POST", "/api/v1/payments/checkout", "Crear link de pago"],
  ["POST", "/api/v1/reminders", "Crear recordatorio manual"],
];

const webhookEndpoints = [
  ["POST", "/api/webhooks/stripe", "Stripe Checkout y Payment Intents"],
  ["POST", "/api/webhooks/mercado-pago", "Mercado Pago Checkout Pro"],
  ["POST", "/api/webhooks/payments", "Google Forms expira cache de pagos"],
  ["POST", "/api/webhooks/player-of-match", "Google Forms dispara push MVP"],
  ["POST", "/api/bot/whatsapp-reminders", "Dispara bot externo de WhatsApp"],
  ["GET/PATCH", "/api/bot/whatsapp-reminders/jobs", "Cola del bot local"],
  ["GET", "/api/cron/player-fee-defined", "Cron mensual de cuota definida"],
  ["GET", "/api/cron/player-fee-reminders", "Cron de cuotas impagas"],
  ["GET", "/api/cron/player-of-match-reminders", "Cron de respaldo MVP"],
  ["GET", "/api/cron/upcoming-match-reminders", "Cron de proximo partido"],
  ["GET", "/api/cron/coach-records-email", "Cron mensual de desglose DT"],
];

export default async function ApiDocsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "api:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="API REST"
        description="Tu rol no tiene permisos para ver contratos de API."
      />
    );
  }

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Premium</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          API REST y webhooks
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Contratos preparados para integraciones externas, automatizaciones y pagos.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Autenticacion"
          description="Session cookie para el panel o Bearer API_SECRET para integraciones servidor a servidor."
          icon={<KeyRound className="size-4" aria-hidden="true" />}
        />
        <InfoCard
          title="Datos"
          description="Todas las rutas consumen IDataService, sin acceso directo desde componentes."
          icon={<Code2 className="size-4" aria-hidden="true" />}
        />
        <InfoCard
          title="Webhooks"
          description="Validacion de firma antes de registrar pagos y eventos."
          icon={<Webhook className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <EndpointCard title="REST" endpoints={restEndpoints} />
        <EndpointCard title="Webhooks y cron" endpoints={webhookEndpoints} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Variables requeridas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <code>API_SECRET</code>
          <code>CRON_SECRET</code>
          <code>WHATSAPP_BOT_WEBHOOK_URL</code>
          <code>WHATSAPP_BOT_WEBHOOK_SECRET</code>
          <code>WHATSAPP_BOT_RUNNER_SECRET</code>
          <code>PAYMENTS_WEBHOOK_SECRET</code>
          <code>MERCADO_PAGO_ACCESS_TOKEN</code>
          <code>MERCADO_PAGO_WEBHOOK_SECRET</code>
          <code>STRIPE_SECRET_KEY</code>
          <code>STRIPE_WEBHOOK_SECRET</code>
        </CardContent>
      </Card>
    </main>
  );
}

function InfoCard({
  description,
  icon,
  title,
}: Readonly<{
  description: string;
  icon: React.ReactNode;
  title: string;
}>) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="bg-primary/10 text-primary rounded-md p-2">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

function EndpointCard({
  endpoints,
  title,
}: Readonly<{
  endpoints: string[][];
  title: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {endpoints.map(([method, path, description]) => (
          <div
            key={`${method}-${path}`}
            className="border-border bg-background rounded-lg border p-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant={method === "GET" ? "secondary" : "default"}>
                  {method}
                </Badge>
                <code className="truncate text-sm">{path}</code>
              </div>
              <Link2 className="text-muted-foreground size-4" aria-hidden="true" />
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
