import { Database, WalletCards } from "lucide-react";

import { CashFlowContent } from "@/components/cash-flow/cash-flow-content";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import type { CashFlowScenario } from "@/types/dashboard";

export const dynamic = "force-dynamic";

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams?: Promise<{
    period?: string;
    scenario?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params?.period ?? "") ? params?.period : undefined;
  const scenario: CashFlowScenario = params?.scenario === "draft" ? "draft" : "real";
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

      <CashFlowContent
        canWrite={hasPermission(user, "cash-flow:write")}
        data={cashFlow}
        initialScenario={scenario}
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
