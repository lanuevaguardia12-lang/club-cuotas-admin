import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache, unstable_expireTag } from "next/cache";

import type {
  FixtureMatchScheduleOverride,
  LeagueCategoryOption,
  LeagueCompetitionKind,
  LeagueFixtureData,
  LeagueFixtureMatch,
  LeagueFixtureRound,
  LeagueGoalEvent,
  LeagueMatchStatus,
  LeagueScorerRow,
  LeagueStandingRow,
  LeagueTournamentOption,
} from "@/types/fixture";
import { parseGoalCountMarker, stripGoalCountMarker } from "@/lib/fixture-goals";
import { getLeagueRefreshSlot } from "@/lib/league-refresh-schedule";

const LEAGUE_BASE_URL = "https://ligacountrysur.com.ar";
const LEAGUE_FOOTBALL_URL = `${LEAGUE_BASE_URL}/futbol`;
const DEFAULT_TOURNAMENT_ID = "329";
const DEFAULT_CATEGORY_ID = "4314";
const DEFAULT_YEAR = 2026;
const MIN_TOURNAMENT_YEAR = 2025;
const SOURCE_TEAM_NAME = "Barrio Dorrego";
export const APP_TEAM_NAME = "La Nueva Guardia";
export const LEAGUE_CACHE_TAG = "league-fixture:snapshot";

interface LeagueSnapshotCompetition extends LeagueCompetitionTarget {
  standings: LeagueStandingRow[];
  rounds: LeagueFixtureRound[];
}

interface LeagueSnapshot {
  fetchedAt: string;
  tournaments: LeagueTournamentOption[];
  availableYears: number[];
  competitions: LeagueSnapshotCompetition[];
  unavailableCompetitionKeys?: string[];
  refreshError?: string;
}

const leagueSnapshotContext = new AsyncLocalStorage<LeagueSnapshot>();
const previousLeagueSnapshot = new AsyncLocalStorage<LeagueSnapshot | undefined>();
const cachedSnapshotOnly = new AsyncLocalStorage<boolean>();
const leagueRequests = new AsyncLocalStorage<Map<string, Promise<string>>>();
let snapshotInFlight: Promise<LeagueSnapshot> | undefined;
let activeLeagueRequests = 0;
const waitingLeagueRequests: Array<() => void> = [];

// Each scheduled window has one persistent entry. A failed refresh is recorded
// too, so navigation does not keep retrying the upstream service after a failure.
const readScheduledLeagueSnapshot = unstable_cache(
  async (slot: string): Promise<{ snapshot?: LeagueSnapshot; error?: string }> => {
    if (cachedSnapshotOnly.getStore()) {
      throw new Error(`No hay una copia previa de la liga para ${slot}.`);
    }
    try {
      return { snapshot: await loadLeagueSnapshot() };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "No se pudo leer la liga.",
      };
    }
  },
  ["league-fixture-scheduled-snapshot-v3"],
  { revalidate: false },
);

async function readLeagueSnapshot(): Promise<LeagueSnapshot> {
  const contextualSnapshot = leagueSnapshotContext.getStore();
  if (contextualSnapshot) return contextualSnapshot;

  const slot = getLeagueRefreshSlot();
  const current = await cachedSnapshotOnly
    .run(true, () => readScheduledLeagueSnapshot(slot))
    .catch(() => null);
  if (current?.snapshot) return current.snapshot;

  // Failed windows never replace a successful snapshot. Look up previous
  // entries without contacting the league if those entries were never filled.
  const saved = await findPreviousLeagueSnapshot(slot);
  if (saved) return { ...saved, refreshError: current?.error ?? saved.refreshError };

  // Bootstrap only when no saved snapshot exists. Once populated, visitors
  // keep the last copy even while a scheduled refresh is late or still running.
  const initial = current ?? (await readScheduledLeagueSnapshot(getLeagueRefreshSlot()));
  if (initial.snapshot) return initial.snapshot;
  throw new Error(initial.error ?? "No hay una copia disponible de la liga.");
}

async function findPreviousLeagueSnapshot(slot: string) {
  for (let previous = 0; previous < 6; previous += 1) {
    slot = getLeagueRefreshSlot(new Date(new Date(slot).getTime() - 1));
    const saved = await cachedSnapshotOnly
      .run(true, () => readScheduledLeagueSnapshot(slot))
      .catch(() => null);
    if (saved?.snapshot) return saved.snapshot;
  }
  return undefined;
}

// Next bypasses nested unstable_cache calls. Resolve the league snapshot before
// entering an account cache, then share it with nested attendance/MVP helpers.
export async function withLeagueSnapshot<T>(
  work: (revision: string) => Promise<T>,
): Promise<T> {
  const snapshot = await readLeagueSnapshot().catch((error): LeagueSnapshot => ({
    // League availability must never hide the user's contact/profile data.
    // Sheet-based attendance and voting still work with an empty league view.
    fetchedAt: getLeagueRefreshSlot(),
    tournaments: FALLBACK_TOURNAMENTS,
    availableYears: getAvailableYears(FALLBACK_TOURNAMENTS),
    competitions: [],
    refreshError: error instanceof Error ? error.message : "Liga no disponible.",
  }));
  return leagueSnapshotContext.run(snapshot, () => work(snapshot.fetchedAt));
}

async function loadLeagueSnapshot(): Promise<LeagueSnapshot> {
  if (snapshotInFlight) {
    return snapshotInFlight;
  }

  snapshotInFlight = leagueRequests.run(new Map(), async () => {
    const metadata = await loadLeagueMetadata();
    const previous = previousLeagueSnapshot.getStore();
    const targets = metadata.availableYears.flatMap((year) =>
      getClubCompetitionTargets(metadata.tournaments, year),
    );
    const results = await Promise.allSettled(
      targets.map(async (target): Promise<LeagueSnapshotCompetition> => {
        const html = await fetchLeagueHtml(
          buildFixtureUrl(target.category.id, target.tournament.id),
          { ajax: true },
        );
        const standings = parseStandings(html);
        const parsedRounds = parseFixtureRounds(html, target);
        const saved = previous?.competitions.find(
          (item) =>
            item.category.id === target.category.id &&
            item.tournament.id === target.tournament.id,
        );

        if (
          !standings.length &&
          !parsedRounds.length &&
          saved &&
          (saved.standings.length || saved.rounds.length)
        ) {
          throw new Error("La liga devolvio una competencia vacia.");
        }

        return {
          ...target,
          standings,
          rounds: await enrichFixtureRoundsWithDetails(parsedRounds),
        };
      }),
    );
    const competitions = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      const target = targets[index];
      const saved = previous?.competitions.find(
        (item) =>
          item.category.id === target.category.id &&
          item.tournament.id === target.tournament.id,
      );
      return saved ? [saved] : [];
    });
    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length === results.length) {
      const failure = failures[0];
      throw failure?.reason ?? new Error("No se pudo actualizar la liga.");
    }

    if (
      !competitions.some((item) => item.standings.length > 0 || item.rounds.length > 0)
    ) {
      throw new Error("La liga no devolvio competencias para actualizar.");
    }

    return {
      ...metadata,
      competitions,
      fetchedAt: new Date().toISOString(),
      unavailableCompetitionKeys: results.flatMap((result, index) =>
        result.status === "rejected"
          ? [`${targets[index].tournament.id}:${targets[index].category.id}`]
          : [],
      ),
      refreshError: failures.length
        ? `${failures.length === 1 ? "No se pudo actualizar una competencia" : `No se pudieron actualizar ${failures.length} competencias`}. Se conserva la informacion disponible; algunas estadisticas pueden estar incompletas.`
        : undefined,
    };
  });

  try {
    return await snapshotInFlight;
  } finally {
    snapshotInFlight = undefined;
  }
}

export async function refreshLeagueFixtureCache() {
  const slot = getLeagueRefreshSlot();
  // Resolve the previous copy outside unstable_cache: nested cache reads bypass
  // saved entries in Next and would otherwise contact the league again.
  const previous = await findPreviousLeagueSnapshot(slot);
  const result = await previousLeagueSnapshot.run(previous, () =>
    readScheduledLeagueSnapshot(slot),
  );
  if (!result.snapshot) throw new Error(result.error ?? "No se pudo actualizar la liga.");
  const snapshot = result.snapshot;

  // The league entry is already saved under this window's key. Expiring only
  // derived account statistics cannot expire the newly warmed league snapshot.
  unstable_expireTag(LEAGUE_CACHE_TAG);
  return {
    competitions: snapshot.competitions.length,
    fetchedAt: snapshot.fetchedAt,
    years: snapshot.availableYears,
    warning: snapshot.refreshError,
  };
}

const FALLBACK_TOURNAMENTS: LeagueTournamentOption[] = [
  {
    id: "329",
    name: "Clausura 2026",
    categories: [
      { id: "4314", name: 'Primera "B"', tournamentId: "329" },
      { id: "4313", name: 'Primera "A"', tournamentId: "329" },
      { id: "4315", name: 'Primera "C"', tournamentId: "329" },
    ],
  },
  {
    id: "327",
    name: "Apertura 2026",
    categories: [
      {
        id: "4201",
        name: 'Primera "C"',
        tournamentId: "327",
      },
      {
        id: "4200",
        name: 'Primera "B"',
        tournamentId: "327",
      },
    ],
  },
  {
    id: "387",
    name: "Copa de Liga 2026",
    categories: [
      {
        id: "4225",
        name: "Primera",
        tournamentId: "387",
      },
    ],
  },
];

interface GetLeagueFixtureDataInput {
  competition?: string;
  tournamentId?: string;
  categoryId?: string;
  year?: string;
}

interface LeagueRawCategory {
  id?: string | number;
  torneo_id?: string | number;
  name?: string;
  deporte?: {
    name?: string;
  };
  categoria?: {
    name?: string;
  };
  torneo?: {
    name?: string;
  };
}

interface LeagueCompetitionTarget {
  tournament: Pick<LeagueTournamentOption, "id" | "name">;
  category: LeagueCategoryOption;
}

interface GetLeagueClubMatchesOptions {
  includeDetails?: boolean;
  targetLimit?: number;
}

export async function getLeagueFixtureData(
  input: GetLeagueFixtureDataInput = {},
): Promise<LeagueFixtureData> {
  let snapshot: LeagueSnapshot;

  try {
    snapshot = await readLeagueSnapshot();
  } catch (error) {
    return buildUnavailableLeagueFixture(input, error);
  }

  const fetchedAt = snapshot.fetchedAt;
  const metadata = snapshot;
  const selected = selectCompetition(snapshot, input);
  const selectedYear = getTournamentYear(selected.tournament.name) ?? DEFAULT_YEAR;
  const sourceUrl = buildFixtureUrl(selected.category.id, selected.tournament.id);
  const selectedCompetitionKind = getLeagueCompetitionKind(
    selected.tournament.name,
    selected.category.name,
  );

  try {
    const competition = snapshot.competitions.find(
      (item) =>
        item.tournament.id === selected.tournament.id &&
        item.category.id === selected.category.id,
    );
    const standings = competition?.standings ?? [];
    const rounds = (competition?.rounds ?? []).map((round) => ({
      ...round,
      matches: round.matches.map(updateMatchDateStatus),
    }));
    const matches = rounds.flatMap((round) => round.matches);
    const clubMatches = matches.filter((match) => match.isClubMatch);
    const allCompetitionMatches = await getLeagueCompetitionMatchesForYear(
      selectedYear,
      metadata.tournaments,
      { includeDetails: true },
    ).catch(() => []);
    const allClubMatches = allCompetitionMatches.filter(
      (match) => match.isClubMatch && !match.involvesBye,
    );
    const globalClubMatches = allClubMatches.length > 0 ? allClubMatches : clubMatches;
    const globalCompetitionMatches =
      allCompetitionMatches.length > 0 ? allCompetitionMatches : matches;
    const nextMatches = buildNextMatches(globalClubMatches);
    const lastMatches = buildLastMatches(globalClubMatches);
    const scorers = buildScorerRows(matches);

    return {
      availableYears: metadata.availableYears,
      selectedCompetitionKey: `${selected.tournament.id}:${selected.category.id}`,
      selectedCompetitionKind,
      selectedYear,
      selectedTournamentId: selected.tournament.id,
      selectedCategoryId: selected.category.id,
      selectedTournamentName: selected.tournament.name,
      selectedCategoryName: selected.category.name,
      tournaments: metadata.tournaments,
      standings,
      matches,
      rounds,
      clubStanding: standings.find((row) => row.isClub),
      allCompetitionMatches: globalCompetitionMatches,
      allClubMatches: globalClubMatches,
      clubMatches,
      nextMatches,
      lastMatches,
      scorers,
      source: {
        provider: "liga-country-sur",
        status: snapshot.refreshError
          ? "error"
          : standings.length > 0 || matches.length > 0
            ? "ready"
            : "empty",
        fetchedAt,
        sourceUrl,
        cachedAt: fetchedAt,
        revalidateSeconds: 0,
        message:
          snapshot.refreshError ??
          (standings.length > 0 || matches.length > 0
            ? "Datos leidos desde Liga Country Sur."
            : "La liga no devolvio datos para este torneo y categoria."),
      },
    };
  } catch (error) {
    return {
      availableYears: metadata.availableYears,
      selectedCompetitionKey: `${selected.tournament.id}:${selected.category.id}`,
      selectedCompetitionKind,
      selectedYear,
      selectedTournamentId: selected.tournament.id,
      selectedCategoryId: selected.category.id,
      selectedTournamentName: selected.tournament.name,
      selectedCategoryName: selected.category.name,
      tournaments: metadata.tournaments,
      standings: [],
      matches: [],
      rounds: [],
      allCompetitionMatches: [],
      allClubMatches: [],
      clubMatches: [],
      nextMatches: [],
      lastMatches: [],
      scorers: [],
      source: {
        provider: "liga-country-sur",
        status: "error",
        fetchedAt,
        sourceUrl,
        cachedAt: fetchedAt,
        revalidateSeconds: 0,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo leer el fixture de Liga Country Sur.",
      },
    };
  }
}

function buildUnavailableLeagueFixture(
  input: GetLeagueFixtureDataInput,
  error: unknown,
): LeagueFixtureData {
  const selected = selectCompetition(
    { tournaments: FALLBACK_TOURNAMENTS, competitions: [] },
    input,
  );
  const fetchedAt = new Date().toISOString();

  return {
    availableYears: getAvailableYears(FALLBACK_TOURNAMENTS),
    selectedCompetitionKey: `${selected.tournament.id}:${selected.category.id}`,
    selectedCompetitionKind: getLeagueCompetitionKind(
      selected.tournament.name,
      selected.category.name,
    ),
    selectedYear: parseRequestedYear(input.year) ?? DEFAULT_YEAR,
    selectedTournamentId: selected.tournament.id,
    selectedCategoryId: selected.category.id,
    selectedTournamentName: selected.tournament.name,
    selectedCategoryName: selected.category.name,
    tournaments: FALLBACK_TOURNAMENTS,
    standings: [],
    matches: [],
    rounds: [],
    allCompetitionMatches: [],
    allClubMatches: [],
    clubMatches: [],
    nextMatches: [],
    lastMatches: [],
    scorers: [],
    source: {
      provider: "liga-country-sur",
      status: "error",
      fetchedAt,
      cachedAt: fetchedAt,
      sourceUrl: LEAGUE_FOOTBALL_URL,
      revalidateSeconds: 0,
      message: error instanceof Error ? error.message : "No se pudo leer la liga.",
    },
  };
}

export async function getLeagueClubMatchesForYear(
  year = DEFAULT_YEAR,
  tournaments?: LeagueTournamentOption[],
  options: GetLeagueClubMatchesOptions = {},
) {
  const matches = await getLeagueCompetitionMatchesForYear(year, tournaments, options);

  return matches.filter((match) => match.isClubMatch && !match.involvesBye);
}

async function getLeagueCompetitionMatchesForYear(
  year = DEFAULT_YEAR,
  tournaments?: LeagueTournamentOption[],
  options: GetLeagueClubMatchesOptions = {},
) {
  const snapshot = await readLeagueSnapshot();
  const metadata = tournaments ? { tournaments } : snapshot;
  const targets = getClubCompetitionTargets(metadata.tournaments, year);
  const selectedTargets =
    typeof options.targetLimit === "number"
      ? targets.slice(0, options.targetLimit)
      : targets;
  const targetKeys = new Set(
    selectedTargets.map((target) => `${target.tournament.id}:${target.category.id}`),
  );

  return sortMatchesBySchedule(
    dedupeLeagueMatches(
      snapshot.competitions
        .filter((item) => targetKeys.has(`${item.tournament.id}:${item.category.id}`))
        .flatMap((item) => item.rounds.flatMap((round) => round.matches))
        .filter((match) => !match.involvesBye)
        .map(updateMatchDateStatus),
    ),
  );
}

export function applyLeagueFixtureScheduleOverrides(
  data: LeagueFixtureData,
  overrides: FixtureMatchScheduleOverride[],
): LeagueFixtureData {
  if (overrides.length === 0) {
    return data;
  }

  const overridesByMatchId = new Map(
    overrides.map((override) => [override.matchId, override]),
  );
  const applyOverride = (match: LeagueFixtureMatch): LeagueFixtureMatch => {
    const override = overridesByMatchId.get(match.id);

    if (!override) {
      return match;
    }

    const { dateIso, time } = splitFixtureOverrideDateTime(override.dateTime);
    const nextDateIso = dateIso ?? match.dateIso;
    const hasOfficialScore =
      typeof match.localScore === "number" && typeof match.visitorScore === "number";
    const hasManualScore =
      typeof override.localScore === "number" &&
      typeof override.visitorScore === "number";
    const hasManualPenalties =
      typeof override.localPenaltyScore === "number" &&
      typeof override.visitorPenaltyScore === "number";
    const manualGoalEvents = buildManualGoalEvents(override.goalScorers);

    return {
      ...match,
      convokedPlayerNames: override.convokedPlayerNames,
      dateIso: nextDateIso,
      goalEvents: [...match.goalEvents, ...manualGoalEvents],
      goals: [...match.goals, ...formatManualGoalLabels(override.goalScorers)],
      localScore:
        !hasOfficialScore && hasManualScore ? override.localScore : match.localScore,
      localPenaltyScore: hasManualPenalties
        ? override.localPenaltyScore
        : match.localPenaltyScore,
      manualGoalScorers: override.goalScorers,
      resultOverrideUpdatedAt:
        hasManualScore || hasManualPenalties || override.goalScorers.length > 0
          ? override.updatedAt
          : undefined,
      roundDate: dateIso ? formatFixtureRoundDate(dateIso) : match.roundDate,
      scheduleOverrideUpdatedAt: override.updatedAt,
      status:
        !hasOfficialScore && hasManualScore
          ? "played"
          : getScheduleAdjustedStatus(match, nextDateIso),
      time: time ?? match.time,
      visitorScore:
        !hasOfficialScore && hasManualScore ? override.visitorScore : match.visitorScore,
      visitorPenaltyScore: hasManualPenalties
        ? override.visitorPenaltyScore
        : match.visitorPenaltyScore,
    };
  };
  const rounds = data.rounds.map((round) => ({
    ...round,
    matches: round.matches.map(applyOverride),
  }));
  const matches = rounds.flatMap((round) => round.matches);
  const clubMatches = matches.filter((match) => match.isClubMatch);
  const allClubMatches = dedupeLeagueMatches(
    (data.allClubMatches.length > 0 ? data.allClubMatches : data.clubMatches)
      .map(applyOverride)
      .filter((match) => match.isClubMatch && !match.involvesBye),
  );
  const allCompetitionMatches = dedupeLeagueMatches(
    (data.allCompetitionMatches.length > 0 ? data.allCompetitionMatches : data.matches)
      .map(applyOverride)
      .filter((match) => !match.involvesBye),
  );

  return {
    ...data,
    allCompetitionMatches,
    allClubMatches,
    clubMatches,
    matches,
    nextMatches: buildNextMatches(allClubMatches),
    lastMatches: buildLastMatches(allClubMatches),
    rounds,
    scorers: buildScorerRows(matches),
  };
}

function buildManualGoalEvents(goalScorers: string[]): LeagueGoalEvent[] {
  return goalScorers.flatMap((playerName) => {
    const cleanPlayerName = stripGoalCountMarker(playerName);
    const count = parseGoalCountMarker(playerName);

    if (!cleanPlayerName) {
      return [];
    }

    return Array.from({ length: count }, () => ({
      playerName: cleanPlayerName,
      teamName: APP_TEAM_NAME,
    }));
  });
}

function formatManualGoalLabels(goalScorers: string[]) {
  return goalScorers.map((playerName) => `${APP_TEAM_NAME}: ${playerName}`);
}

async function loadLeagueMetadata() {
  const html = await fetchLeagueHtml(LEAGUE_FOOTBALL_URL);
  const tournaments = parseTournamentOptions(html);

  if (tournaments.length === 0) {
    throw new Error("La liga no devolvio el listado de torneos.");
  }

  return { tournaments, availableYears: getAvailableYears(tournaments) };
}

async function fetchLeagueHtml(url: string, options: { ajax?: boolean } = {}) {
  const requests = leagueRequests.getStore();
  const key = `${options.ajax ? "ajax:" : ""}${url}`;
  const existing = requests?.get(key);

  if (existing) {
    return existing;
  }

  const pending = requestLeagueHtml(url, options);
  requests?.set(key, pending);
  return pending;
}

async function requestLeagueHtml(url: string, options: { ajax?: boolean }) {
  await new Promise<void>((resolve) => {
    const start = () => {
      activeLeagueRequests += 1;
      resolve();
    };

    if (activeLeagueRequests < 6) {
      start();
    } else {
      waitingLeagueRequests.push(start);
    }
  });

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        ...(options.ajax ? { "X-Requested-With": "XMLHttpRequest" } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Liga Country Sur respondio ${response.status}`);
    }

    return await response.text();
  } finally {
    activeLeagueRequests -= 1;
    waitingLeagueRequests.shift()?.();
  }
}

function buildFixtureUrl(categoryId: string, tournamentId: string) {
  return `${LEAGUE_BASE_URL}/liga/tabla-resultados-alt/${categoryId}/${tournamentId}`;
}

function selectCompetition(
  snapshot: Pick<
    LeagueSnapshot,
    "tournaments" | "competitions" | "unavailableCompetitionKeys"
  >,
  input: GetLeagueFixtureDataInput,
) {
  const { tournaments } = snapshot;
  const parsedCompetition = parseCompetitionKey(input.competition);
  const requestedYear = parseRequestedYear(input.year);
  const requestedTournamentId = parsedCompetition?.tournamentId ?? input.tournamentId;
  const requestedCategoryId = parsedCompetition?.categoryId ?? input.categoryId;
  const requested = findCompetition(
    tournaments,
    requestedTournamentId,
    requestedCategoryId,
  );

  if (
    requested &&
    (!requestedYear || getTournamentYear(requested.tournament.name) === requestedYear)
  ) {
    return requested;
  }

  if (!requestedTournamentId && !requestedCategoryId) {
    const currentClubCompetition = findCompetition(
      tournaments,
      DEFAULT_TOURNAMENT_ID,
      DEFAULT_CATEGORY_ID,
    );
    if (
      currentClubCompetition &&
      (!requestedYear || requestedYear === DEFAULT_YEAR) &&
      snapshot.unavailableCompetitionKeys?.includes(
        `${DEFAULT_TOURNAMENT_ID}:${DEFAULT_CATEGORY_ID}`,
      )
    ) {
      return currentClubCompetition;
    }
    const latestClubCompetition = findLatestClubCompetition(snapshot, requestedYear);

    if (latestClubCompetition) {
      return latestClubCompetition;
    }
  }

  const yearTournaments = filterTournamentsByYear(
    tournaments,
    requestedYear ?? DEFAULT_YEAR,
  );
  const fallbackYearTournaments =
    yearTournaments.length > 0 ? yearTournaments : tournaments;

  return (
    findByTournamentAndCategoryName(
      fallbackYearTournaments,
      "Clausura 2026",
      'Primera "B"',
    ) ??
    findCompetition(
      fallbackYearTournaments,
      DEFAULT_TOURNAMENT_ID,
      DEFAULT_CATEGORY_ID,
    ) ??
    findByTournamentAndCategoryName(
      fallbackYearTournaments,
      "Apertura 2026",
      'Primera "B"',
    ) ??
    firstAvailableCompetition(fallbackYearTournaments) ??
    firstAvailableCompetition(FALLBACK_TOURNAMENTS)!
  );
}

function findLatestClubCompetition(
  snapshot: Pick<LeagueSnapshot, "tournaments" | "competitions">,
  requestedYear?: number,
) {
  const years = requestedYear ? [requestedYear] : getAvailableYears(snapshot.tournaments);

  for (const year of years) {
    const target = snapshot.competitions
      .filter(
        (item) =>
          getTournamentYear(item.tournament.name) === year &&
          (item.standings.some((row) => row.isClub) ||
            item.rounds.some((round) =>
              round.matches.some((match) => match.isClubMatch && !match.involvesBye),
            )),
      )
      .sort((left, right) => {
        const kindDiff =
          getDefaultCompetitionKindPriority(
            getLeagueCompetitionKind(right.tournament.name, right.category.name),
          ) -
          getDefaultCompetitionKindPriority(
            getLeagueCompetitionKind(left.tournament.name, left.category.name),
          );
        // A postponed Apertura fixture or an undated match must not replace
        // Clausura's league table. Cup results still enter next/last matches.
        return (
          kindDiff ||
          getCompetitionPriority(right) - getCompetitionPriority(left) ||
          latestKnownClubMatchDate(right) - latestKnownClubMatchDate(left) ||
          getTournamentIdNumber(right.tournament.id) -
            getTournamentIdNumber(left.tournament.id)
        );
      })[0];

    if (target) {
      return target;
    }
  }

  return undefined;
}

function latestKnownClubMatchDate(competition: LeagueSnapshotCompetition) {
  return Math.max(
    0,
    ...competition.rounds
      .flatMap((round) => round.matches)
      .filter((match) => match.isClubMatch && match.dateIso)
      .map(getMatchSortValue)
      .filter((value) => value !== Number.MAX_SAFE_INTEGER),
  );
}

function getDefaultCompetitionKindPriority(kind: LeagueCompetitionKind) {
  return kind === "league" ? 2 : kind === "cup" ? 1 : 0;
}

function parseRequestedYear(value?: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100
    ? parsed
    : undefined;
}

function parseCompetitionKey(value?: string) {
  const match = /^(\d+):(\d+)$/.exec(value ?? "");

  if (!match) {
    return undefined;
  }

  return {
    tournamentId: match[1],
    categoryId: match[2],
  };
}

function findCompetition(
  tournaments: LeagueTournamentOption[],
  tournamentId?: string,
  categoryId?: string,
) {
  if (!tournamentId || !categoryId) {
    return undefined;
  }

  const tournament = tournaments.find((item) => item.id === tournamentId);
  const category = tournament?.categories.find((item) => item.id === categoryId);

  return tournament && category ? { tournament, category } : undefined;
}

function findByTournamentAndCategoryName(
  tournaments: LeagueTournamentOption[],
  tournamentName: string,
  categoryName: string,
) {
  const tournament = tournaments.find((item) => item.name === tournamentName);
  const category = tournament?.categories.find((item) => item.name === categoryName);

  return tournament && category ? { tournament, category } : undefined;
}

function firstAvailableCompetition(tournaments: LeagueTournamentOption[]) {
  const tournament = tournaments.find((item) => item.categories.length > 0);
  const category = tournament?.categories[0];

  return tournament && category ? { tournament, category } : undefined;
}

function getClubCompetitionTargets(tournaments: LeagueTournamentOption[], year: number) {
  return filterTournamentsByYear(tournaments, year)
    .flatMap((tournament) =>
      tournament.categories.map((category): LeagueCompetitionTarget => ({
        tournament,
        category,
      })),
    )
    .sort(sortCompetitionTargets);
}

function filterTournamentsByYear(tournaments: LeagueTournamentOption[], year: number) {
  return tournaments.filter((tournament) => getTournamentYear(tournament.name) === year);
}

function getAvailableYears(tournaments: LeagueTournamentOption[]) {
  return Array.from(
    new Set(
      tournaments
        .map((tournament) => getTournamentYear(tournament.name))
        .filter((year): year is number => Boolean(year)),
    ),
  ).sort((left, right) => right - left);
}

function parseTournamentOptions(html: string): LeagueTournamentOption[] {
  const options = parseLeagueSelectOptions(html);
  const categoriesByTournament = parseLeagueCategoriesByTournament(html);

  return options
    .map((option) => {
      const categories = (categoriesByTournament[option.id] ?? [])
        .filter(isRelevantCategory)
        .map((category): LeagueCategoryOption => {
          const categoryName = normalizeWhitespace(
            category.categoria?.name ?? category.name ?? `Categoria ${category.id}`,
          );

          return {
            id: String(category.id),
            name: categoryName,
            tournamentId: String(category.torneo_id ?? option.id),
          };
        });

      return {
        ...option,
        categories,
      };
    })
    .filter(
      (tournament) => isRelevantTournament(tournament) && tournament.categories.length,
    )
    .sort(sortTournaments);
}

function parseLeagueSelectOptions(html: string) {
  const selectMatch = /<select[^>]*id=["']la_torneo["'][^>]*>([\s\S]*?)<\/select>/i.exec(
    html,
  );

  if (!selectMatch) {
    return FALLBACK_TOURNAMENTS.map(({ id, name }) => ({ id, name }));
  }

  return [
    ...selectMatch[1].matchAll(
      /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map((match) => ({
      id: match[1],
      name: normalizeWhitespace(decodeHtml(stripTags(match[2]))),
    }))
    .filter((option) => option.id && option.name);
}

function parseLeagueCategoriesByTournament(html: string) {
  const marker = "var campeonatosXTorneo";
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) {
    return {};
  }

  const jsonStart = html.indexOf("{", markerIndex);
  const semicolonIndex = html.indexOf("\n    ;", jsonStart);
  const jsonEnd =
    semicolonIndex >= 0
      ? semicolonIndex
      : html.indexOf(";\n\n    var selTorneo", jsonStart);

  if (jsonStart < 0 || jsonEnd < 0) {
    return {};
  }

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd).trim()) as Record<
      string,
      LeagueRawCategory[]
    >;
  } catch {
    return {};
  }
}

function isRelevantTournament(tournament: { name: string }) {
  const year = getTournamentYear(tournament.name);

  return Boolean(year && year >= MIN_TOURNAMENT_YEAR);
}

function getTournamentYear(name: string) {
  const year = Number(/\b(20\d{2})\b/.exec(name)?.[1]);

  return Number.isFinite(year) && year > 0 ? year : undefined;
}

function isRelevantCategory(category: LeagueRawCategory) {
  const sport = normalizeWhitespace(category.deporte?.name ?? "");
  const tournamentName = normalizeWhitespace(category.torneo?.name ?? "");
  const categoryName = normalizeWhitespace(
    category.categoria?.name ?? category.name ?? "",
  );
  const normalizedCategory = removeAccents(categoryName).toLowerCase();
  const normalizedTournament = removeAccents(tournamentName).toLowerCase();

  return (
    /futbol mayores/i.test(sport) &&
    /^primera\b/i.test(normalizedCategory) &&
    !/femenino|junior|master|senior|super master/i.test(normalizedCategory) &&
    !/menores/i.test(normalizedTournament)
  );
}

export function getLeagueCompetitionKind(
  tournamentName: string,
  categoryName = "",
): LeagueCompetitionKind {
  const normalized = removeAccents(`${tournamentName} ${categoryName}`).toLowerCase();

  if (/\bamistoso\b/.test(normalized)) {
    return "friendly";
  }

  if (/\bcopa\b|play\s*off|semifinal|final|promocion/.test(normalized)) {
    return "cup";
  }

  return "league";
}

function sortCompetitionTargets(
  left: LeagueCompetitionTarget,
  right: LeagueCompetitionTarget,
) {
  const priorityDiff =
    getCompetitionPriority(right) - getCompetitionPriority(left) ||
    getTournamentIdNumber(right.tournament.id) -
      getTournamentIdNumber(left.tournament.id);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return left.category.name.localeCompare(right.category.name, "es-AR");
}

function getCompetitionPriority(target: LeagueCompetitionTarget) {
  const normalized = removeAccents(
    `${target.tournament.name} ${target.category.name}`,
  ).toLowerCase();

  if (/\bcopa\b/.test(normalized)) {
    return 3;
  }

  if (/clausura/.test(normalized)) {
    return 2;
  }

  if (/apertura/.test(normalized)) {
    return 1;
  }

  return 0;
}

function getTournamentIdNumber(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function sortTournaments(a: LeagueTournamentOption, b: LeagueTournamentOption) {
  const aYear = Number(/\b(20\d{2})\b/.exec(a.name)?.[1] ?? 0);
  const bYear = Number(/\b(20\d{2})\b/.exec(b.name)?.[1] ?? 0);

  if (aYear !== bYear) {
    return bYear - aYear;
  }

  return a.name.localeCompare(b.name, "es-AR");
}

function parseStandings(html: string): LeagueStandingRow[] {
  const tableMatch =
    /<table[^>]*class=["'][^"']*alt-table[^"']*["'][^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i.exec(
      html,
    );

  if (!tableMatch) {
    return [];
  }

  return [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => {
      const rowHtml = match[1];
      const cellTexts = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (cell) => decodeHtml(stripTags(cell[1])),
      );
      const teamName = normalizeTeamName(
        decodeHtml(
          stripTags(
            /<span[^>]*class=["'][^"']*team-nm[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
              rowHtml,
            )?.[1] ??
              cellTexts[1] ??
              "",
          ),
        ),
      );

      if (!teamName) {
        return undefined;
      }

      const goalsFor = toNumber(cellTexts[6]);
      const goalsAgainst = toNumber(cellTexts[7]);

      return {
        position: toNumber(cellTexts[0]),
        teamName,
        played: toNumber(cellTexts[2]),
        won: toNumber(cellTexts[3]),
        drawn: toNumber(cellTexts[4]),
        lost: toNumber(cellTexts[5]),
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        points: toNumber(cellTexts[8]),
        isClub: isSourceTeamName(teamName),
      };
    })
    .filter((row): row is LeagueStandingRow => Boolean(row));
}

function parseFixtureRounds(
  html: string,
  competition: LeagueCompetitionTarget,
): LeagueFixtureRound[] {
  const fragments = html
    .split(/(?=<div class=["']alt-round["'][^>]*>)/i)
    .filter((fragment) => /^<div class=["']alt-round["'][^>]*>/i.test(fragment.trim()));
  const year = Number(/\b(20\d{2})\b/.exec(competition.tournament.name)?.[1]);

  return fragments
    .map((roundHtml) => {
      const name =
        extractText(
          roundHtml,
          /<span[^>]*class=["'][^"']*alt-round-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        ) || "Fecha";
      const date =
        extractText(
          roundHtml,
          /<span[^>]*class=["'][^"']*alt-round-date[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        ) || "";
      const dateIso = parseSpanishFixtureDate(date, year);
      const matches = parseRoundMatches(roundHtml, name, date, dateIso, competition);

      return {
        name,
        date,
        matches,
      };
    })
    .filter((round) => round.matches.length > 0)
    .sort(compareFixtureRoundsBySchedule);
}

function parseRoundMatches(
  roundHtml: string,
  round: string,
  roundDate: string,
  dateIso?: string,
  competition?: LeagueCompetitionTarget,
) {
  const safeCompetition =
    competition ??
    ({
      tournament: { id: "fallback", name: "Liga Country Sur" },
      category: { id: "fallback", name: "Primera", tournamentId: "fallback" },
    } satisfies LeagueCompetitionTarget);
  const competitionKind = getLeagueCompetitionKind(
    safeCompetition.tournament.name,
    safeCompetition.category.name,
  );

  const starts = [...roundHtml.matchAll(/<div class=["']alt-match\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === "number");

  return starts
    .map((start, index): LeagueFixtureMatch | undefined => {
      const matchHtml = roundHtml.slice(start, starts[index + 1] ?? roundHtml.length);
      const id =
        /data-fixture-hashed=["']([^"']+)["']/i.exec(matchHtml)?.[1] ??
        `${round}-${index + 1}`;
      const time = extractText(
        matchHtml,
        /<div[^>]*class=["'][^"']*amd-time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      );
      const localTeam = normalizeTeamName(
        extractText(
          matchHtml,
          /<div[^>]*class=["'][^"']*amd-team[^"']*amd-local[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        ),
      );
      const visitorTeam = normalizeTeamName(
        extractText(
          matchHtml,
          /<div[^>]*class=["'][^"']*amd-team[^"']*amd-visitor[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        ),
      );

      if (!localTeam || !visitorTeam) {
        return undefined;
      }

      const scoreText = extractText(
        matchHtml,
        /<div[^>]*class=["'][^"']*amd-score[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      );
      const score = parseScore(scoreText);
      const status = parseMatchStatus(matchHtml, score, dateIso);
      const detailUrl = parseDetailUrl(matchHtml);
      const goalEvents: LeagueGoalEvent[] = [];
      const goals = parseDetailList(matchHtml, ["gol", "goles"]);
      const cards = parseDetailList(matchHtml, ["tarjeta", "amonestacion"]);
      const isClubMatch = isSourceTeamName(localTeam) || isSourceTeamName(visitorTeam);
      const involvesBye =
        /^(libre|bye)$/i.test(localTeam) || /^(libre|bye)$/i.test(visitorTeam);

      return {
        id: createLeagueMatchId(safeCompetition, id),
        competitionKind,
        competitionName: safeCompetition.tournament.name,
        categoryName: safeCompetition.category.name,
        round,
        roundDate,
        dateIso,
        time,
        localTeam,
        visitorTeam,
        status,
        localScore: score?.local,
        visitorScore: score?.visitor,
        detailUrl,
        goalEvents,
        goals,
        cards,
        isClubMatch,
        involvesBye,
      };
    })
    .filter((match): match is LeagueFixtureMatch => Boolean(match));
}

function createLeagueMatchId(competition: LeagueCompetitionTarget, fixtureId: string) {
  return `${competition.tournament.id}:${competition.category.id}:${fixtureId}`;
}

function buildNextMatches(matches: LeagueFixtureMatch[]) {
  return sortMatchesBySchedule(
    matches.filter((match) => match.status === "pending" && !match.involvesBye),
  ).slice(0, 3);
}

function buildLastMatches(matches: LeagueFixtureMatch[]) {
  const knownDate = (match: LeagueFixtureMatch) => {
    const value = getMatchSortValue(match);
    return value === Number.MAX_SAFE_INTEGER ? 0 : value;
  };
  return matches
    .filter((match) => match.status === "played" && !match.involvesBye)
    .sort((left, right) => knownDate(right) - knownDate(left))
    .slice(0, 3);
}

function updateMatchDateStatus(match: LeagueFixtureMatch): LeagueFixtureMatch {
  const status = getScheduleAdjustedStatus(match, match.dateIso);
  return status === match.status ? match : { ...match, status };
}

function buildScorerRows(matches: LeagueFixtureMatch[]): LeagueScorerRow[] {
  const scorers = new Map<string, LeagueScorerRow>();

  for (const goal of matches.flatMap((match) => match.goalEvents)) {
    if (goal.ownGoal) {
      continue;
    }

    const key = `${normalizeTextKey(goal.playerName)}|${normalizeTextKey(goal.teamName)}`;
    const existing = scorers.get(key);

    scorers.set(key, {
      goals: (existing?.goals ?? 0) + 1,
      playerName: existing?.playerName ?? goal.playerName,
      teamName: existing?.teamName ?? goal.teamName,
    });
  }

  return [...scorers.values()].sort(
    (left, right) =>
      right.goals - left.goals ||
      left.playerName.localeCompare(right.playerName, "es-AR"),
  );
}

function compareFixtureRoundsBySchedule(
  left: LeagueFixtureRound,
  right: LeagueFixtureRound,
) {
  const dateDiff = getRoundSortValue(left) - getRoundSortValue(right);

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return getRoundNumber(left.name) - getRoundNumber(right.name);
}

function getRoundSortValue(round: LeagueFixtureRound) {
  return Math.min(...round.matches.map(getMatchSortValue));
}

function getRoundNumber(name: string) {
  const value = Number(/\d+/.exec(name)?.[0]);

  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function dedupeLeagueMatches(matches: LeagueFixtureMatch[]) {
  const seen = new Set<string>();
  const uniqueMatches: LeagueFixtureMatch[] = [];

  for (const match of matches) {
    const key = [
      match.competitionKind,
      normalizeTextKey(match.competitionName),
      match.dateIso ?? match.roundDate,
      normalizeTextKey(match.localTeam),
      normalizeTextKey(match.visitorTeam),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueMatches.push(match);
  }

  return uniqueMatches;
}

function sortMatchesBySchedule(matches: LeagueFixtureMatch[]) {
  return [...matches].sort(
    (left, right) => getMatchSortValue(left) - getMatchSortValue(right),
  );
}

function getMatchSortValue(match: LeagueFixtureMatch) {
  const date = match.dateIso ?? "";
  const time = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const hour = time ? Number(time[1]) : 23;
  const minute = time ? Number(time[2]) : 59;
  const value = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`,
  ).getTime();

  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function splitFixtureOverrideDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);

  if (!match) {
    return {
      dateIso: undefined,
      time: undefined,
    };
  }

  return {
    dateIso: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  };
}

function getScheduleAdjustedStatus(
  match: LeagueFixtureMatch,
  dateIso?: string,
): LeagueMatchStatus {
  if (match.status === "played" || !dateIso) {
    return match.status;
  }

  return new Date(`${dateIso}T23:59:59-03:00`) < new Date()
    ? "without-result"
    : "pending";
}

function formatFixtureRoundDate(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
  })
    .format(date)
    .replace(",", "");
}

function parseMatchStatus(
  matchHtml: string,
  score: { local: number; visitor: number } | undefined,
  dateIso?: string,
): LeagueMatchStatus {
  if (score || /badge-fin|finalizad|jugad/i.test(matchHtml)) {
    return "played";
  }

  if (dateIso && new Date(`${dateIso}T23:59:59-03:00`) < new Date()) {
    return "without-result";
  }

  return "pending";
}

function parseScore(value: string) {
  const match = /(\d+)\s*[-–]\s*(\d+)/.exec(value);

  if (!match) {
    return undefined;
  }

  return {
    local: Number(match[1]),
    visitor: Number(match[2]),
  };
}

function parseDetailUrl(matchHtml: string) {
  const raw =
    /data-detail-url=["']([^"']+)["']/i.exec(matchHtml)?.[1] ??
    /href=["']([^"']+)["'][^>]*class=["'][^"']*modal-load/i.exec(matchHtml)?.[1];

  if (!raw) {
    return undefined;
  }

  return raw.startsWith("http") ? raw : `${LEAGUE_BASE_URL}${raw}`;
}

function parseDetailList(matchHtml: string, labels: string[]) {
  const items = [
    ...matchHtml.matchAll(/<(?:li|span|div)[^>]*>([\s\S]*?)<\/(?:li|span|div)>/gi),
  ]
    .map((match) => decodeHtml(stripTags(match[1])))
    .map(normalizeWhitespace)
    .filter(Boolean);

  return items.filter((item) =>
    labels.some((label) => item.toLowerCase().includes(label.toLowerCase())),
  );
}

async function enrichFixtureRoundsWithDetails(
  rounds: LeagueFixtureRound[],
  shouldEnrich: (match: LeagueFixtureMatch) => boolean = () => true,
) {
  const matches = rounds.flatMap((round) => round.matches);
  const detailEntries = matches
    .filter(
      (match) => shouldEnrich(match) && match.status === "played" && match.detailUrl,
    )
    .map((match) => [match.id, match.detailUrl!] as const);

  if (detailEntries.length === 0) {
    return rounds;
  }

  const detailResults = await Promise.allSettled(
    detailEntries.map(async ([id, detailUrl]) => {
      const html = await fetchLeagueHtml(detailUrl, { ajax: true });

      return [id, parseMatchResultDetail(html)] as const;
    }),
  );
  const detailsByMatchId = new Map(
    detailResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
  );

  return rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      const detail = detailsByMatchId.get(match.id);

      if (!detail) {
        return match;
      }

      return {
        ...match,
        goalEvents: detail.goalEvents,
        goals:
          detail.goalEvents.length > 0
            ? detail.goalEvents.map(formatGoalEvent)
            : match.goals,
      };
    }),
  }));
}

function parseMatchResultDetail(html: string) {
  return {
    goalEvents: parseGoalEventsFromResultDetail(html),
  };
}

function parseGoalEventsFromResultDetail(html: string): LeagueGoalEvent[] {
  const goalsStart = html.search(/<div[^>]*class=["'][^"']*dr-goals\b/i);

  if (goalsStart < 0) {
    return [];
  }

  const nextSectionStart = html.indexOf('<div class="dr-section"', goalsStart + 1);
  const goalsHtml =
    nextSectionStart > goalsStart
      ? html.slice(goalsStart, nextSectionStart)
      : html.slice(goalsStart);
  const columnStarts = [
    ...goalsHtml.matchAll(/<div[^>]*class=["'][^"']*dr-goals-col\b[^"']*["'][^>]*>/gi),
  ]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === "number");

  return columnStarts.flatMap((start, index): LeagueGoalEvent[] => {
    const columnHtml = goalsHtml.slice(
      start,
      columnStarts[index + 1] ?? goalsHtml.length,
    );
    const teamName = normalizeTeamName(
      extractText(
        columnHtml,
        /<div[^>]*class=["'][^"']*dr-goals-col-lbl[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      ),
    );

    if (!teamName) {
      return [];
    }

    const goalStarts = [
      ...columnHtml.matchAll(/<div[^>]*class=["'][^"']*dr-goal-item[^"']*["'][^>]*>/gi),
    ]
      .map((match) => match.index)
      .filter((goalIndex): goalIndex is number => typeof goalIndex === "number");

    return goalStarts.flatMap((goalStart, goalIndex): LeagueGoalEvent[] => {
      const goalHtml = columnHtml.slice(
        goalStart,
        goalStarts[goalIndex + 1] ?? columnHtml.length,
      );
      const rawPlayerName = extractText(
        goalHtml,
        /<span[^>]*class=["'][^"']*dr-goal-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      );
      const playerName = formatPersonName(stripGoalCountMarker(rawPlayerName));

      if (!playerName) {
        return [];
      }

      const count = parseGoalCountMarker(
        normalizeWhitespace(decodeHtml(stripTags(goalHtml))),
      );
      const goalEvent = {
        ownGoal: /dr-own-goal|en\s+contra/i.test(goalHtml),
        playerName,
        teamName,
      };

      return Array.from({ length: count }, () => goalEvent);
    });
  });
}

function formatGoalEvent(goal: LeagueGoalEvent) {
  return `${goal.playerName} (${goal.teamName}${goal.ownGoal ? ", e/c" : ""})`;
}

function parseSpanishFixtureDate(value: string, year: number) {
  if (!value || !Number.isFinite(year)) {
    return undefined;
  }

  const months: Record<string, number> = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };
  const normalized = normalizeWhitespace(value).toLowerCase();
  const match = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i.exec(normalized);

  if (!match) {
    return undefined;
  }

  const day = Number(match[1]);
  const month = months[removeAccents(match[2])];

  if (!day || month === undefined) {
    return undefined;
  }

  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function extractText(html: string, pattern: RegExp) {
  return normalizeWhitespace(decodeHtml(stripTags(pattern.exec(html)?.[1] ?? "")));
}

function normalizeTeamName(value: string) {
  const normalized = normalizeWhitespace(value);

  return isSourceTeamName(normalized) ? APP_TEAM_NAME : normalized;
}

function isSourceTeamName(value: string) {
  const normalized = removeAccents(normalizeWhitespace(value)).toLowerCase();

  return (
    normalized === removeAccents(SOURCE_TEAM_NAME).toLowerCase() ||
    normalized === removeAccents(APP_TEAM_NAME).toLowerCase()
  );
}

function toNumber(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(/[^\d-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtml(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    lt: "<",
    gt: ">",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-zA-Z]+);/g, (entity, code: string) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }

    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }

    return namedEntities[code] ?? entity;
  });
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatPersonName(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(
      /(^|[\s,.'-])([a-záéíóúñ])/g,
      (match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`,
    );
}

function normalizeTextKey(value: string) {
  return removeAccents(normalizeWhitespace(value)).toLowerCase();
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
