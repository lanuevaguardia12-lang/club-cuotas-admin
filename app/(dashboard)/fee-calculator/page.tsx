import { Calculator, Database } from "lucide-react";

import { FeeCalculatorContent } from "@/components/fee-calculator/fee-calculator-content";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

interface FeeCalculatorPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function FeeCalculatorPage({
  searchParams,
}: FeeCalculatorPageProps) {
  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params.period ?? "") ? params.period : undefined;
  const user = await getCurrentUser();
  const data = await getDataService().getFeeCalculatorData(period);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Finanzas</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              <Calculator className="text-primary size-7" aria-hidden="true" />
              Calculador de cuota
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Costos, canchas reales, asistencia y devoluciones calculadas desde partidos.
            </p>
          </div>
          <div className="border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Database className="text-muted-foreground size-4" aria-hidden="true" />
            <span className="font-medium">{data.source.provider}</span>
            <span
              className={
                data.source.status === "ready"
                  ? "text-primary"
                  : data.source.status === "empty"
                    ? "text-muted-foreground"
                    : "text-destructive"
              }
            >
              {data.source.status}
            </span>
          </div>
        </div>
      </header>

      <FeeCalculatorContent
        data={data}
        canMaintain={hasPermission(user, "maintenance:manage")}
      />

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}
    </main>
  );
}
