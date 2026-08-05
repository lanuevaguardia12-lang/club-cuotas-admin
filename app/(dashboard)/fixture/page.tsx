import { redirect } from "next/navigation";
import { CalendarDays, Database } from "lucide-react";

import { FixtureContent } from "@/components/fixture/fixture-content";
import { EmptySection } from "@/components/layout/empty-section";
import { hasPermission } from "@/lib/auth/roles";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import { getLeagueFixtureData } from "@/lib/league-fixture";

export const dynamic = "force-dynamic";

interface FixturePageProps {
  searchParams: Promise<{
    competition?: string;
    torneo?: string;
    campeonato?: string;
    year?: string;
  }>;
}

export default async function FixturePage({ searchParams }: FixturePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (!hasPermission(user, "fixture:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Fixture"
        description="Tu rol no tiene permisos para ver fixtures y tablas de la liga."
      />
    );
  }

  const params = await searchParams;
  const data = await getLeagueFixtureData({
    competition: params.competition,
    tournamentId: params.torneo,
    categoryId: params.campeonato,
    year: params.year,
  });

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">Liga Country Sur</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              <CalendarDays className="text-primary size-7" aria-hidden="true" />
              Fixture
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Tabla de posiciones, partidos del equipo y fixture oficial de la liga.
            </p>
          </div>
          <div className="border-border bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Database className="text-muted-foreground size-4" aria-hidden="true" />
            <span className="font-medium">Liga Country Sur</span>
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

      <FixtureContent data={data} />
    </main>
  );
}
