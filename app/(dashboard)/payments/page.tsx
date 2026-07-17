import { redirect } from "next/navigation";
import { CreditCard, Landmark, Link2, WalletCards } from "lucide-react";

import { CreateCheckoutForm } from "@/components/payments/create-checkout-form";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { PaymentStatus } from "@/types/premium";

export default async function PaymentsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "payments:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Pagos"
        description="Tu rol no tiene permisos para administrar integraciones de pago."
      />
    );
  }

  const premium = await getDataService().getPremiumData();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Premium</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          Integraciones de pago
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Links de pago, webhooks, conciliacion inicial y seguimiento de Mercado Pago y
          Stripe.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Pendientes"
          value={premium.summary.pendingPayments}
          detail="Checkout creado o pendiente"
          icon={<WalletCards className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Aprobados"
          value={premium.summary.approvedPayments}
          detail="Pagos confirmados"
          icon={<Landmark className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Registros"
          value={premium.payments.length}
          detail="Eventos de pago guardados"
          icon={<CreditCard className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <CreateCheckoutForm />

        <Card>
          <CardHeader>
            <CardTitle>Pagos recientes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {premium.payments.slice(0, 20).map((payment) => (
              <div
                key={`${payment.provider}-${payment.externalId}-${payment.updatedAt}`}
                className="border-border bg-background rounded-lg border p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{payment.playerName}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {payment.period} · {payment.provider} · {payment.externalId}
                    </p>
                  </div>
                  <Badge variant={paymentStatusVariant(payment.status)}>
                    {payment.status}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  {payment.checkoutUrl ? (
                    <a
                      href={payment.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      <Link2 className="size-4" aria-hidden="true" />
                      Abrir checkout
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            {premium.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Todavia no hay pagos registrados.
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

function paymentStatusVariant(status: PaymentStatus) {
  if (status === "approved" || status === "paid") {
    return "success";
  }

  if (status === "rejected" || status === "cancelled") {
    return "danger";
  }

  if (status === "pending" || status === "created") {
    return "warning";
  }

  return "secondary";
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
