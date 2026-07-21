import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";

import { EmptySection } from "@/components/layout/empty-section";
import { PlayerDirectoryContent } from "@/components/players/player-directory-content";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "players:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Jugadores"
        description="Tu rol no tiene permisos para administrar la base de jugadores."
      />
    );
  }

  const data = await getDataService().getPlayersData();

  return (
    <main className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">Plantel</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <UsersRound className="text-primary size-7" aria-hidden="true" />
            Jugadores
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Base editable de jugadores usada por el calculador de cuota y preparada para
            migrar a PostgreSQL sin cambiar la interfaz.
          </p>
        </div>
      </header>

      <PlayerDirectoryContent
        data={data}
        canWrite={hasPermission(user, "players:write")}
        canRestoreRoster={hasPermission(user, "maintenance:manage")}
      />
    </main>
  );
}
