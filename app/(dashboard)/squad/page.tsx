import { Mail, Phone, Shirt, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { getDataService } from "@/services/data-service";
import type { PlayerDirectoryItem } from "@/types/players";

export const dynamic = "force-dynamic";

export default async function SquadPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "squad:read")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Plantel"
        description="Tu rol no tiene permisos para ver el plantel."
      />
    );
  }

  const data = await getDataService().getPlayersData();
  const players = [...data.players].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "es");
  });
  const activePlayers = players.filter((player) => player.status === "active").length;

  return (
    <main className="grid min-w-0 gap-6 overflow-hidden">
      <header className="grid min-w-0 gap-2">
        <p className="text-muted-foreground text-sm font-medium">La Nueva Guardia</p>
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          <UsersRound className="text-primary size-7 shrink-0" />
          Plantel
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Jugadores cargados en la base del club.
        </p>
      </header>

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricPill label="Jugadores" value={String(players.length)} />
        <MetricPill label="Activos" value={String(activePlayers)} />
        <MetricPill
          label="Con posición"
          value={String(players.filter((player) => player.position).length)}
        />
      </section>

      {players.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </section>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <div className="grid min-h-40 place-items-center text-center">
              <div>
                <h2 className="font-semibold">{data.emptyState.title}</h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  {data.emptyState.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PlayerCard({ player }: { player: PlayerDirectoryItem }) {
  const positions = [player.position, player.secondPosition].filter(Boolean);

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-full text-sm font-black">
            {getInitials(player.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h2 className="line-clamp-2 font-semibold">{player.name}</h2>
              <Badge variant={player.status === "active" ? "success" : "secondary"}>
                {player.status === "active" ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {positions.length > 0 ? (
                positions.map((position) => (
                  <span
                    key={position}
                    className={cn(
                      "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                      getPositionClassName(position),
                    )}
                  >
                    {position}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <Shirt className="size-3.5" />
                  Sin posición
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-muted-foreground grid gap-1.5 text-xs">
          {player.phone ? (
            <p className="flex min-w-0 items-center gap-2">
              <Phone className="size-3.5 shrink-0" />
              <span className="truncate">{player.phone}</span>
            </p>
          ) : null}
          {player.email ? (
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{player.email}</span>
            </p>
          ) : null}
          {!player.phone && !player.email ? <p>Sin contacto público cargado.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "LNG";
}

function getPositionClassName(position: string) {
  const normalized = position
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("arquero")) {
    return "bg-amber-100 text-amber-900";
  }

  if (
    normalized.includes("defensor") ||
    normalized.includes("lateral") ||
    normalized.includes("central")
  ) {
    return "bg-sky-100 text-sky-900";
  }

  if (normalized.includes("medio") || normalized.includes("volante")) {
    return "bg-emerald-100 text-emerald-900";
  }

  if (normalized.includes("delantero") || normalized.includes("punta")) {
    return "bg-rose-100 text-rose-900";
  }

  return "bg-muted text-muted-foreground";
}
