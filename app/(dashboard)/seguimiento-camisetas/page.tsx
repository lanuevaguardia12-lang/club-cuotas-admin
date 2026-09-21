import {
  CalendarDays,
  CircleDot,
  History,
  MessageCircle,
  PlusCircle,
  RefreshCcw,
  Shirt,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { recordEquipmentAssignment } from "@/app/(dashboard)/seguimiento-camisetas/actions";
import { EquipmentAssignmentSubmitButton } from "@/components/equipment/equipment-assignment-submit-button";
import { EmptySection } from "@/components/layout/empty-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/roles";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/session";
import {
  APP_TEAM_NAME,
  applyLeagueFixtureScheduleOverrides,
  getLeagueFixtureData,
} from "@/lib/league-fixture";
import { sanitizeWhatsAppPhone } from "@/lib/reminders";
import { getDataService } from "@/services/data-service";
import type { EquipmentAssignment, EquipmentType } from "@/types/equipment";
import type { LeagueFixtureMatch } from "@/types/fixture";
import type { PlayerDirectoryItem } from "@/types/players";

export const dynamic = "force-dynamic";

interface TrackingPlayer {
  player: PlayerDirectoryItem;
  lastBalls?: EquipmentAssignment;
  lastShirt?: EquipmentAssignment;
}

const equipmentLabels: Record<EquipmentType, string> = {
  balls: "pelotas",
  shirt: "camiseta",
};

export default async function ShirtTrackingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (!hasPermission(user, "notifications:manage")) {
    return (
      <EmptySection
        eyebrow="Acceso restringido"
        title="Seguimiento de camisetas"
        description="Solo un administrador puede administrar camisetas y pelotas."
      />
    );
  }

  const dataService = getDataService();
  const [rawFixture, fixtureOverrides, playersData, assignments] = await Promise.all([
    getLeagueFixtureData().catch(() => null),
    dataService.getFixtureMatchScheduleOverrides().catch(() => []),
    dataService.getPlayersData().catch(() => ({ players: [] })),
    dataService.getEquipmentAssignments().catch(() => []),
  ]);
  const fixture = rawFixture
    ? applyLeagueFixtureScheduleOverrides(rawFixture, fixtureOverrides)
    : null;
  const nextMatch = fixture?.nextMatches.find(
    (match) => match.isClubMatch && !match.involvesBye,
  );
  const activePlayers = playersData.players
    .filter((player) => player.status === "active")
    .sort(comparePlayersByLastName);
  const trackingPlayers = buildTrackingPlayers(activePlayers, assignments);
  const convocation = buildConvocation(nextMatch, activePlayers, assignments);
  const shirtSuggestion = selectSuggestedPlayer(convocation.players, "shirt");
  const ballsSuggestion = selectSuggestedPlayer(convocation.players, "balls");
  const nextMatchLabel = nextMatch ? formatMatchLabel(nextMatch) : "";
  const nextMatchDate = nextMatch?.dateIso ?? getArgentinaDateKey();

  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">Operativo</p>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          <Shirt className="text-primary size-7" aria-hidden="true" />
          Seguimiento de camisetas
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Rotación de camiseta y pelotas según la lista madre de jugadores y los
          convocados del próximo partido.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Jugadores activos"
          value={activePlayers.length}
          detail="Lista madre ordenada por apellido"
          icon={<UsersRound className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Convocados"
          value={convocation.players.length + convocation.missing.length}
          detail={nextMatch ? `Para ${getMatchRival(nextMatch)}` : "Sin próximo partido"}
          icon={<CalendarDays className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Camiseta"
          value={countAssignments(assignments, "shirt")}
          detail="Registros históricos"
          icon={<Shirt className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          title="Pelotas"
          value={countAssignments(assignments, "balls")}
          detail="Registros históricos"
          icon={<CircleDot className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="grid gap-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="text-primary size-5" aria-hidden="true" />
              Próximo partido
            </CardTitle>
            {nextMatch ? (
              <p className="text-muted-foreground text-sm">{nextMatchLabel}</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No encontré un próximo partido del club en el fixture.
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {nextMatch && convocation.players.length > 0 ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <SuggestedCard
                    assignmentDate={nextMatchDate}
                    equipmentType="shirt"
                    match={nextMatch}
                    player={shirtSuggestion?.player}
                    reset={shirtSuggestion?.reset ?? false}
                  />
                  <SuggestedCard
                    assignmentDate={nextMatchDate}
                    equipmentType="balls"
                    match={nextMatch}
                    player={ballsSuggestion?.player}
                    reset={ballsSuggestion?.reset ?? false}
                  />
                </div>
                <ConvokedTable
                  assignmentDate={nextMatchDate}
                  match={nextMatch}
                  players={convocation.players}
                  shirtSuggestionId={shirtSuggestion?.player.id}
                  ballsSuggestionId={ballsSuggestion?.player.id}
                />
              </>
            ) : nextMatch ? (
              <div className="border-border bg-muted/30 rounded-md border p-4">
                <p className="font-medium">Todavía no hay convocados guardados.</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Cargá la placa de convocados en Fixture y esta pantalla va a elegir el
                  próximo responsable desde esa lista.
                </p>
              </div>
            ) : null}

            {convocation.missing.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                No pude cruzar estos convocados con la lista madre:{" "}
                {convocation.missing.join(", ")}.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="text-primary size-5" aria-hidden="true" />
              Carga manual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={recordEquipmentAssignment} className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                <span>Jugador</span>
                <select
                  name="playerId"
                  className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  required
                >
                  {activePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                <span>Elemento</span>
                <select
                  name="equipmentType"
                  className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  required
                >
                  <option value="shirt">Camiseta</option>
                  <option value="balls">Pelotas</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                <span>Fecha</span>
                <input
                  name="assignedAt"
                  type="date"
                  defaultValue={getArgentinaDateKey()}
                  className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                <span>Notas</span>
                <input
                  name="notes"
                  type="text"
                  placeholder="Ej: carga inicial o ajuste manual"
                  className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                />
              </label>
              <EquipmentAssignmentSubmitButton
                label="Guardar registro"
                pendingLabel="Guardando registro..."
                size="default"
              />
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="text-primary size-5" aria-hidden="true" />
            Lista madre
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MasterPlayerTable players={trackingPlayers} />
        </CardContent>
      </Card>
    </main>
  );
}

function SuggestedCard({
  assignmentDate,
  equipmentType,
  match,
  player,
  reset,
}: {
  assignmentDate: string;
  equipmentType: EquipmentType;
  match: LeagueFixtureMatch;
  player?: PlayerDirectoryItem;
  reset: boolean;
}) {
  return (
    <div className="border-border bg-background grid gap-3 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase">
            {equipmentType === "shirt" ? "Camiseta" : "Pelotas"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {player?.name ?? "Sin sugerencia"}
          </h2>
        </div>
        {reset ? (
          <Badge variant="warning">
            <RefreshCcw className="mr-1 size-3" aria-hidden="true" />
            Reinicia ronda
          </Badge>
        ) : (
          <Badge variant="outline">Siguiente</Badge>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {player
          ? `Le toca llevar ${equipmentLabels[equipmentType]} para ${formatMatchLabel(match)}.`
          : "Cargá convocados para poder sugerir un responsable."}
      </p>
      {player ? (
        <div className="flex flex-wrap gap-2">
          <AssignmentForm
            assignmentDate={assignmentDate}
            equipmentType={equipmentType}
            match={match}
            player={player}
          />
          <WhatsAppButton equipmentType={equipmentType} match={match} player={player} />
        </div>
      ) : null}
    </div>
  );
}

function ConvokedTable({
  assignmentDate,
  ballsSuggestionId,
  match,
  players,
  shirtSuggestionId,
}: {
  assignmentDate: string;
  ballsSuggestionId?: string;
  match: LeagueFixtureMatch;
  players: TrackingPlayer[];
  shirtSuggestionId?: string;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Convocado</th>
            <th className="px-3 py-2 text-left font-semibold">Última camiseta</th>
            <th className="px-3 py-2 text-left font-semibold">Últimas pelotas</th>
            <th className="px-3 py-2 text-left font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {players.map(({ lastBalls, lastShirt, player }) => (
            <tr key={player.id} className="border-border border-t">
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{player.name}</p>
                  {player.id === shirtSuggestionId ? (
                    <Badge variant="success">Camiseta</Badge>
                  ) : null}
                  {player.id === ballsSuggestionId ? (
                    <Badge variant="success">Pelotas</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {player.position || "Sin posición"} · #{player.jerseyNumber || "-"}
                </p>
              </td>
              <td className="px-3 py-2 align-top">
                <AssignmentSummary assignment={lastShirt} empty="Nunca" />
              </td>
              <td className="px-3 py-2 align-top">
                <AssignmentSummary assignment={lastBalls} empty="Nunca" />
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap gap-2">
                  <AssignmentForm
                    assignmentDate={assignmentDate}
                    equipmentType="shirt"
                    match={match}
                    player={player}
                  />
                  <AssignmentForm
                    assignmentDate={assignmentDate}
                    equipmentType="balls"
                    match={match}
                    player={player}
                  />
                  <WhatsAppButton equipmentType="shirt" match={match} player={player} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MasterPlayerTable({ players }: { players: TrackingPlayer[] }) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Jugador</th>
            <th className="px-3 py-2 text-left font-semibold">Teléfono</th>
            <th className="px-3 py-2 text-left font-semibold">Camiseta</th>
            <th className="px-3 py-2 text-left font-semibold">Pelotas</th>
          </tr>
        </thead>
        <tbody>
          {players.map(({ lastBalls, lastShirt, player }) => (
            <tr key={player.id} className="border-border border-t">
              <td className="px-3 py-2 align-top">
                <p className="font-medium">{player.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">{player.id}</p>
              </td>
              <td className="px-3 py-2 align-top">{player.phone || "-"}</td>
              <td className="px-3 py-2 align-top">
                <AssignmentSummary assignment={lastShirt} empty="Sin registro" />
              </td>
              <td className="px-3 py-2 align-top">
                <AssignmentSummary assignment={lastBalls} empty="Sin registro" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentForm({
  assignmentDate,
  equipmentType,
  match,
  player,
}: {
  assignmentDate: string;
  equipmentType: EquipmentType;
  match: LeagueFixtureMatch;
  player: PlayerDirectoryItem;
}) {
  return (
    <form action={recordEquipmentAssignment}>
      <input name="equipmentType" type="hidden" value={equipmentType} />
      <input name="playerId" type="hidden" value={player.id} />
      <input name="playerName" type="hidden" value={player.name} />
      <input name="assignedAt" type="hidden" value={assignmentDate} />
      <input name="matchDate" type="hidden" value={match.dateIso ?? ""} />
      <input name="matchId" type="hidden" value={match.id} />
      <input name="matchLabel" type="hidden" value={formatMatchLabel(match)} />
      <EquipmentAssignmentSubmitButton
        label={equipmentType === "shirt" ? "Llevó camiseta" : "Llevó pelotas"}
        pendingLabel="Guardando..."
      />
    </form>
  );
}

function WhatsAppButton({
  equipmentType,
  match,
  player,
}: {
  equipmentType: EquipmentType;
  match: LeagueFixtureMatch;
  player: PlayerDirectoryItem;
}) {
  const phone = sanitizeWhatsAppPhone(player.phone);

  if (!phone) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        <MessageCircle />
        Sin WhatsApp
      </Button>
    );
  }

  const text = `Buenas ${getFirstName(player.name)}, ¿cómo estás? Te toca llevar ${equipmentLabels[equipmentType]} para el partido vs ${getMatchRival(match)} del ${formatDate(match.dateIso ?? match.roundDate)}. ¿Podés?`;

  return (
    <Button asChild size="sm" variant="outline">
      <a
        href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}
        rel="noreferrer"
        target="_blank"
      >
        <MessageCircle />
        WhatsApp
      </a>
    </Button>
  );
}

function AssignmentSummary({
  assignment,
  empty,
}: {
  assignment?: EquipmentAssignment;
  empty: string;
}) {
  if (!assignment) {
    return <span className="text-muted-foreground">{empty}</span>;
  }

  return (
    <div>
      <p className="font-medium">{formatDate(assignment.assignedAt)}</p>
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
        {assignment.matchLabel || assignment.notes || "Carga manual"}
      </p>
    </div>
  );
}

function MetricCard({
  detail,
  icon,
  title,
  value,
}: {
  detail: string;
  icon: ReactNode;
  title: string;
  value: number;
}) {
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

function buildTrackingPlayers(
  players: PlayerDirectoryItem[],
  assignments: EquipmentAssignment[],
) {
  const lastShirtByPlayer = buildLastAssignmentByPlayer(assignments, "shirt");
  const lastBallsByPlayer = buildLastAssignmentByPlayer(assignments, "balls");

  return players.map((player) => ({
    lastBalls: lastBallsByPlayer.get(player.id),
    lastShirt: lastShirtByPlayer.get(player.id),
    player,
  }));
}

function buildConvocation(
  match: LeagueFixtureMatch | undefined,
  players: PlayerDirectoryItem[],
  assignments: EquipmentAssignment[],
) {
  const playerLookup = buildPlayerLookup(players);
  const convokedNames = match?.convokedPlayerNames?.filter(Boolean) ?? [];
  const missing: string[] = [];
  const convokedPlayers = convokedNames.flatMap((name) => {
    const player = playerLookup.get(normalizePlayerLookup(name));

    if (!player) {
      missing.push(name);
      return [];
    }

    return [player];
  });

  return {
    missing,
    players: buildTrackingPlayers(
      uniquePlayersById(convokedPlayers).sort(comparePlayersByLastName),
      assignments,
    ),
  };
}

function selectSuggestedPlayer(players: TrackingPlayer[], type: EquipmentType) {
  if (players.length === 0) {
    return undefined;
  }

  const getLastAssignment = (player: TrackingPlayer) =>
    type === "shirt" ? player.lastShirt : player.lastBalls;
  const neverAssigned = players.filter((player) => !getLastAssignment(player));
  const pool = neverAssigned.length > 0 ? neverAssigned : players;

  return {
    player: [...pool].sort((left, right) => {
      const leftAssignment = getLastAssignment(left);
      const rightAssignment = getLastAssignment(right);

      if (leftAssignment && rightAssignment) {
        const dateComparison = leftAssignment.assignedAt.localeCompare(
          rightAssignment.assignedAt,
        );

        if (dateComparison !== 0) {
          return dateComparison;
        }
      }

      return comparePlayersByLastName(left.player, right.player);
    })[0]?.player,
    reset: neverAssigned.length === 0,
  };
}

function buildLastAssignmentByPlayer(
  assignments: EquipmentAssignment[],
  type: EquipmentType,
) {
  const entries = assignments
    .filter((assignment) => assignment.equipmentType === type)
    .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));
  const lastByPlayer = new Map<string, EquipmentAssignment>();

  for (const assignment of entries) {
    if (!lastByPlayer.has(assignment.playerId)) {
      lastByPlayer.set(assignment.playerId, assignment);
    }
  }

  return lastByPlayer;
}

function buildPlayerLookup(players: PlayerDirectoryItem[]) {
  const lookup = new Map<string, PlayerDirectoryItem>();

  for (const player of players) {
    for (const value of [player.id, player.name, slugify(player.name)]) {
      const key = normalizePlayerLookup(value);

      if (key) {
        lookup.set(key, player);
      }
    }
  }

  return lookup;
}

function uniquePlayersById(players: PlayerDirectoryItem[]) {
  const seen = new Set<string>();

  return players.filter((player) => {
    if (seen.has(player.id)) {
      return false;
    }

    seen.add(player.id);
    return true;
  });
}

function countAssignments(assignments: EquipmentAssignment[], type: EquipmentType) {
  return assignments.filter((assignment) => assignment.equipmentType === type).length;
}

function comparePlayersByLastName(left: PlayerDirectoryItem, right: PlayerDirectoryItem) {
  return getSortableName(left.name).localeCompare(getSortableName(right.name), "es-AR");
}

function getSortableName(name: string) {
  const parts = name.trim().split(/\s+/);

  if (parts.length < 2) {
    return normalizePlayerLookup(name);
  }

  return normalizePlayerLookup(
    `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`,
  );
}

function normalizePlayerLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string) {
  return normalizePlayerLookup(value).replace(/\s+/g, "-");
}

function getMatchRival(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function formatMatchLabel(match: LeagueFixtureMatch) {
  return `${formatDate(match.dateIso ?? match.roundDate)} · ${match.competitionKind.toUpperCase()} · vs ${getMatchRival(match)}`;
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const normalized = value.includes("T") ? value : `${value}T12:00:00-03:00`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function getArgentinaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
