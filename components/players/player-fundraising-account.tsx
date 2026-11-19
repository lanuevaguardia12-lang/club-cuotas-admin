import { Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FundraisingAccount } from "@/types/fundraising";

export function PlayerFundraisingAccount({ account }: { account?: FundraisingAccount }) {
  const movements = account?.movements ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="text-primary size-5" />
          Cuenta corriente de recaudaciones
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Aportes a favor por participar en recaudaciones y descuentos utilizados en
          cuotas. El saldo restante queda disponible para próximos meses.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <AccountMetric
            label="Saldo a favor"
            amount={account?.balance ?? 0}
            highlighted
          />
          <AccountMetric label="Total recaudado" amount={account?.totalCollected ?? 0} />
          <AccountMetric label="Beneficios utilizados" amount={account?.totalUsed ?? 0} />
        </div>
        {movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay movimientos de recaudación.
          </p>
        ) : (
          <details className="border-border rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Ver movimientos ({movements.length})
            </summary>
            <ol className="mt-3 grid gap-3">
              {movements.map((movement) => (
                <li
                  key={movement.id}
                  className="border-border grid gap-1 border-t pt-3 text-sm sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-medium">{movement.concept}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatDate(movement.date)} ·{" "}
                      {movement.kind === "credit"
                        ? "Recaudación a favor"
                        : movement.kind === "reversal"
                          ? "Beneficio eliminado · saldo reintegrado"
                          : `Beneficio en cuota ${formatPeriod(movement.period)}`}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p
                      className={
                        movement.kind !== "benefit"
                          ? "text-primary font-semibold"
                          : "font-semibold"
                      }
                    >
                      {movement.kind === "benefit" ? "−" : "+"}
                      {formatCurrency(movement.amount)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Saldo: {formatCurrency(movement.balance)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function AccountMetric({
  label,
  amount,
  highlighted = false,
}: {
  label: string;
  amount: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? "border-primary/20 bg-primary/5 rounded-md border p-3"
          : "border-border rounded-md border p-3"
      }
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold">{formatCurrency(amount)}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(date);
}

function formatPeriod(value: string) {
  const date = new Date(`${value}-15T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}
