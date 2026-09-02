import { redirect } from "next/navigation";
import { ClipboardList, Database } from "lucide-react";

import { CoachRecordsContent } from "@/components/coach-records/coach-records-content";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

interface CoachRecordsPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function CoachRecordsPage({ searchParams }: CoachRecordsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (!hasPermission(user, "coach-records:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Registros DT"
        description="Tu rol no tiene permisos para ver el desglose del director técnico."
      />
    );
  }

  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params.period ?? "") ? params.period : undefined;
  const data = await getDataService().getCoachRecordsData(period);

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Administración</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              <ClipboardList className="text-primary size-7" aria-hidden="true" />
              Registros DT
              <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
                {data.source.status}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Desglose mensual de partidos, horas reales y costo del director técnico.
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

      <CoachRecordsContent data={data} />
    </main>
  );
}
