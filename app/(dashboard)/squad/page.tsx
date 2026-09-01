import { Shirt, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { getDataService } from "@/services/data-service";
import type { AccountUser } from "@/types/account";
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

  const dataService = getDataService();
  const [data, accounts] = await Promise.all([
    dataService.getPlayersData(),
    dataService.getAccountUsers().catch(() => []),
  ]);
  const photosByPlayerKey = buildPlayerPhotoMap(accounts);
  const players = [...data.players].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "es");
  });
  const activePlayers = players.filter((player) => player.status === "active");

  return (
    <main className="grid min-w-0 gap-6 overflow-hidden">
      <header className="grid min-w-0 gap-2">
        <p className="text-muted-foreground text-sm font-medium">La Nueva Guardia</p>
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          <UsersRound className="text-primary size-7 shrink-0" />
          Plantel
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Vista rápida del plantel, con foto y posiciones de cada jugador.
        </p>
      </header>

      {data.source.status === "error" ? (
        <section className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {data.source.message}
        </section>
      ) : null}

      {activePlayers.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {activePlayers.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              photoUrl={getPlayerPhotoUrl(player, photosByPlayerKey)}
            />
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

function PlayerCard({
  photoUrl,
  player,
}: {
  photoUrl?: string;
  player: PlayerDirectoryItem;
}) {
  const positions = [player.position, player.secondPosition].filter(Boolean);

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid min-h-56 gap-3 p-3 text-center">
        <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-md ring-2 ring-sky-100 sm:size-28">
          {photoUrl ? (
            <div
              aria-label={player.name}
              className="size-full bg-cover bg-center"
              role="img"
              style={{ backgroundImage: `url("${photoUrl}")` }}
            />
          ) : (
            <span className="text-primary text-xl font-black">
              {getInitials(player.name)}
            </span>
          )}
        </div>

        <div className="grid gap-2">
          <h2 className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold sm:text-base">
            {player.name}
          </h2>
          <div className="flex flex-wrap justify-center gap-1.5">
            {positions.length > 0 ? (
              positions.map((position) => (
                <Badge
                  key={position}
                  className={cn("max-w-full truncate", getPositionClassName(position))}
                  variant="secondary"
                >
                  {position}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Shirt className="size-3.5" />
                Sin posición
              </span>
            )}
          </div>
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

function buildPlayerPhotoMap(accounts: AccountUser[]) {
  const photos = new Map<string, string>();

  for (const account of accounts) {
    if (!account.profilePhotoDataUrl) {
      continue;
    }

    const candidates = [
      account.playerId,
      account.userId,
      account.username,
      account.name,
      createPlayerSlug(account.name),
      createPlayerSlug(account.userId),
      createPlayerSlug(account.username),
    ];

    for (const candidate of candidates) {
      for (const key of buildPlayerPhotoKeys(candidate)) {
        if (!photos.has(key)) {
          photos.set(key, account.profilePhotoDataUrl);
        }
      }
    }
  }

  return photos;
}

function getPlayerPhotoUrl(
  player: PlayerDirectoryItem,
  photosByPlayerKey: Map<string, string>,
) {
  if (player.profilePhotoDataUrl) {
    return player.profilePhotoDataUrl;
  }

  const candidates = [player.id, player.name, createPlayerSlug(player.name)];

  for (const candidate of candidates) {
    for (const key of buildPlayerPhotoKeys(candidate)) {
      const photoUrl = photosByPlayerKey.get(key);

      if (photoUrl) {
        return photoUrl;
      }
    }
  }

  return undefined;
}

function buildPlayerPhotoKeys(value?: string) {
  if (!value) {
    return [];
  }

  const normalized = normalizePlayerPhotoKey(value);
  const spaced = normalizePlayerPhotoKey(value.replace(/[-_]+/g, " "));

  return Array.from(new Set([normalized, spaced].filter(Boolean)));
}

function createPlayerSlug(value?: string) {
  return normalizePlayerPhotoKey(value ?? "").replace(/\s+/g, "-");
}

function normalizePlayerPhotoKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getPositionClassName(position: string) {
  const normalized = position
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("arquero")) {
    return "bg-amber-100 text-amber-900 hover:bg-amber-100";
  }

  if (
    normalized.includes("defensor") ||
    normalized.includes("lateral") ||
    normalized.includes("central")
  ) {
    return "bg-sky-100 text-sky-900 hover:bg-sky-100";
  }

  if (normalized.includes("medio") || normalized.includes("volante")) {
    return "bg-emerald-100 text-emerald-900 hover:bg-emerald-100";
  }

  if (normalized.includes("delantero") || normalized.includes("punta")) {
    return "bg-rose-100 text-rose-900 hover:bg-rose-100";
  }

  return "bg-muted text-muted-foreground hover:bg-muted";
}
