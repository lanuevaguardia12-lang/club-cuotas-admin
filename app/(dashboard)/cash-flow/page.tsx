import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Database,
  Scale,
  WalletCards,
} from "lucide-react";

import { CashFlowContent } from "@/components/cash-flow/cash-flow-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

const metricIcons = {
  income: ArrowDownCircle,
  expenses: ArrowUpCircle,
  balance: Scale,
  cash: WalletCards,
};

const metricTones = {
  neutral: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams?: Promise<{
    period?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params?.period ?? "") ? params?.period : undefined;
  const cashFlow = await getDataService().getCashFlowData(period);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Finanzas</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
              Cash Flow
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Ingresos, gastos, balance y saldo calculados desde el servicio central.
            </p>
          </div>
          <div className="border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Database className="text-muted-foreground size-4" aria-hidden="true" />
            <span className="font-medium">{cashFlow.source.provider}</span>
            <span
              className={
                cashFlow.source.status === "ready"
                  ? "text-primary"
                  : cashFlow.source.status === "empty"
                    ? "text-muted-foreground"
                    : "text-destructive"
              }
            >
              {cashFlow.source.status}
            </span>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cashFlow.metrics.map((item) => {
          const Icon = metricIcons[item.id] ?? BarChart3;

          return (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {item.title}
                </CardTitle>
                <div className={`rounded-md p-2 ${metricTones[item.tone]}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{item.value}</div>
                <p className="text-muted-foreground mt-1 text-sm">{item.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <CashFlowContent
        canWrite={hasPermission(user, "cash-flow:write")}
        data={cashFlow}
      />

      {cashFlow.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {cashFlow.source.message}
        </section>
      ) : null}

      {cashFlow.source.status !== "ready" ? (
        <section className="border-border bg-card grid min-h-64 place-items-center rounded-lg border border-dashed p-6 text-center">
          <div className="max-w-sm">
            <div className="bg-muted mx-auto grid size-12 place-items-center rounded-lg">
              <WalletCards className="text-muted-foreground size-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{cashFlow.emptyState.title}</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {cashFlow.emptyState.description}
            </p>
            <p className="text-muted-foreground mt-4 text-xs">
              Cache: {cashFlow.source.revalidateSeconds}s
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
