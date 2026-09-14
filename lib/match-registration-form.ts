import "server-only";

import { APP_TEAM_NAME } from "@/lib/league-fixture";
import type { IDataService } from "@/services/IDataService";
import type { LeagueFixtureMatch } from "@/types/fixture";
import type { PlayerOfMatchMatch } from "@/types/player-of-match";

const DEFAULT_FORM_URL =
  "https://docs.google.com/forms/d/1q32Y_k_lVAGg833M-oBHMUc9dmExtl1fjWzKZV9pZPA/viewform";

export const MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY = "__default";

export interface MatchRegistrationStatus {
  playersCount: number;
  registered: boolean;
}

interface BuildMatchRegistrationFormUrlInput {
  match: LeagueFixtureMatch;
  playerNames: string[];
}

export function buildMatchRegistrationFormUrl({
  match,
  playerNames,
}: BuildMatchRegistrationFormUrlInput) {
  const url = new URL(getMatchRegistrationFormUrl());
  const entries = getMatchRegistrationFormEntries();

  url.searchParams.set("usp", "pp_url");
  appendEntry(url, entries.rival, getMatchRival(match));
  appendEntry(url, entries.date, match.dateIso ?? match.roundDate);
  appendEntry(url, entries.competition, formatCompetitionKind(match.competitionKind));
  appendEntry(url, entries.homeAway, getClubHomeAway(match));
  appendEntry(
    url,
    entries.coachAttended,
    process.env.GOOGLE_FORMS_MATCH_COACH_ATTENDED_VALUE ?? "Si",
  );

  for (const playerName of playerNames) {
    for (const playerValue of getMatchRegistrationPlayerValues(playerName, playerNames)) {
      appendEntry(url, entries.players, playerValue);
    }
  }

  return url.toString();
}

export function getMatchRegistrationPeriod(match: LeagueFixtureMatch) {
  return match.dateIso?.slice(0, 7) ?? MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY;
}

export function getMatchRegistrationPlayerNames(
  match: LeagueFixtureMatch,
  playerNamesByPeriod: Record<string, string[]>,
) {
  const convokedPlayerNames = match.convokedPlayerNames?.filter(Boolean) ?? [];

  if (convokedPlayerNames.length > 0) {
    return convokedPlayerNames;
  }

  return (
    playerNamesByPeriod[getMatchRegistrationPeriod(match)] ??
    playerNamesByPeriod[MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY] ??
    []
  );
}

export async function getRegistrationPlayerNamesByPeriod(
  dataService: IDataService,
  matches: LeagueFixtureMatch[],
) {
  const basePlayerNames = (
    await dataService.getPlayersData().catch(() => ({ players: [] }))
  ).players
    .filter((player) => player.status === "active")
    .map((player) => player.name);
  const periods = Array.from(
    new Set(
      matches
        .filter((match) => match.isClubMatch)
        .map(getMatchRegistrationPeriod)
        .filter((period) => period !== MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY),
    ),
  );
  const entries = await Promise.all(
    periods.map(async (period) => {
      const calculatorData = await dataService
        .getFeeCalculatorData(period)
        .catch(() => null);
      const periodPlayerNames =
        calculatorData?.players
          .filter((player) => player.status === "active")
          .map((player) => player.name) ?? [];

      return [
        period,
        periodPlayerNames.length > 0 ? periodPlayerNames : basePlayerNames,
      ] as const;
    }),
  );

  return {
    [MATCH_REGISTRATION_DEFAULT_PLAYERS_KEY]: basePlayerNames,
    ...Object.fromEntries(entries),
  };
}

export function buildMatchRegistrationStatusByMatchKey(matches: PlayerOfMatchMatch[]) {
  return Object.fromEntries(
    matches
      .filter((match) => match.players.length > 0)
      .map((match) => [
        getMatchRegistrationStatusKey({
          date: match.date,
          rival: match.rival,
          sourceType: match.sourceType,
        }),
        {
          playersCount: match.players.length,
          registered: true,
        } satisfies MatchRegistrationStatus,
      ]),
  );
}

export function getMatchRegistrationStatusKeyForFixture(match: LeagueFixtureMatch) {
  return getMatchRegistrationStatusKey({
    date: match.dateIso ?? "",
    rival: getMatchRival(match),
    sourceType: match.competitionKind,
  });
}

function getMatchRegistrationFormUrl() {
  const rawUrl =
    process.env.GOOGLE_FORMS_MATCH_REGISTRATION_URL ??
    process.env.NEXT_PUBLIC_MATCH_REGISTRATION_FORM_URL ??
    DEFAULT_FORM_URL;

  return rawUrl.replace(/\/edit(\?.*)?$/, "/viewform");
}

function getMatchRegistrationFormEntries() {
  return {
    coachAttended: process.env.GOOGLE_FORMS_MATCH_COACH_ATTENDED_ENTRY,
    competition: process.env.GOOGLE_FORMS_MATCH_COMPETITION_ENTRY,
    date: process.env.GOOGLE_FORMS_MATCH_DATE_ENTRY,
    homeAway: process.env.GOOGLE_FORMS_MATCH_HOME_AWAY_ENTRY,
    players: process.env.GOOGLE_FORMS_MATCH_PLAYERS_ENTRY,
    rival: process.env.GOOGLE_FORMS_MATCH_RIVAL_ENTRY,
  };
}

function appendEntry(url: URL, entryId: string | undefined, value: string) {
  const normalizedValue = value.trim();

  if (!entryId || !normalizedValue) {
    return;
  }

  url.searchParams.append(normalizeEntryKey(entryId), normalizedValue);
}

function normalizeEntryKey(entryId: string) {
  return entryId.startsWith("entry.") ? entryId : `entry.${entryId}`;
}

function getMatchRegistrationPlayerValues(playerName: string, playerNames: string[]) {
  const cleanedName = cleanMatchRegistrationPlayerName(playerName);
  const values = new Set<string>();

  addMatchRegistrationPlayerValue(values, playerName);
  addMatchRegistrationPlayerValue(values, cleanedName);

  for (const alias of getConfiguredMatchRegistrationPlayerAliases(cleanedName)) {
    addMatchRegistrationPlayerValue(values, alias);
  }

  const parts = cleanedName.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const givenNames = parts.slice(0, -1).join(" ");

    addMatchRegistrationPlayerValue(values, `${lastName} ${givenNames}`);
    addMatchRegistrationPlayerValue(values, `${lastName} ${firstName}`);

    if (isUniqueMatchRegistrationAlias(firstName, playerNames)) {
      addMatchRegistrationPlayerValue(values, firstName);
    }

    if (
      parts.length > 2 &&
      givenNames !== firstName &&
      isUniqueMatchRegistrationAlias(givenNames, playerNames)
    ) {
      addMatchRegistrationPlayerValue(values, givenNames);
    }
  }

  return [...values];
}

function getConfiguredMatchRegistrationPlayerAliases(playerName: string) {
  const aliasesByPlayer = parseMatchRegistrationPlayerAliases(
    process.env.GOOGLE_FORMS_MATCH_PLAYER_ALIASES,
  );
  const normalizedPlayerName = normalizeRegistrationAliasKey(playerName);

  return aliasesByPlayer.get(normalizedPlayerName) ?? [];
}

function parseMatchRegistrationPlayerAliases(value?: string) {
  const aliasesByPlayer = new Map<string, string[]>();
  const rawValue = value?.trim();

  if (!rawValue) {
    return aliasesByPlayer;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string[] | string>;

    for (const [playerName, aliases] of Object.entries(parsed)) {
      aliasesByPlayer.set(
        normalizeRegistrationAliasKey(playerName),
        Array.isArray(aliases) ? aliases : [aliases],
      );
    }

    return aliasesByPlayer;
  } catch {
    // Allows a compact env format: "Gonzalo Ladona=Gonzalo,Ladona Gonzalo;..."
  }

  for (const item of rawValue.split(/[;\n]/)) {
    const [playerName, aliases] = item.split("=");

    if (!playerName || !aliases) {
      continue;
    }

    aliasesByPlayer.set(
      normalizeRegistrationAliasKey(playerName),
      aliases.split(",").map((alias) => alias.trim()),
    );
  }

  return aliasesByPlayer;
}

function isUniqueMatchRegistrationAlias(alias: string, playerNames: string[]) {
  const normalizedAlias = normalizeRegistrationAliasKey(alias);
  let matches = 0;

  for (const playerName of playerNames) {
    const parts = cleanMatchRegistrationPlayerName(playerName)
      .split(/\s+/)
      .filter(Boolean);
    const aliases = new Set([
      parts[0],
      parts.slice(0, -1).join(" "),
      cleanMatchRegistrationPlayerName(playerName),
    ]);

    if (
      [...aliases].some(
        (value) => normalizeRegistrationAliasKey(value) === normalizedAlias,
      )
    ) {
      matches += 1;
    }
  }

  return matches === 1;
}

function addMatchRegistrationPlayerValue(values: Set<string>, value: string) {
  const normalizedValue = value.trim();

  if (normalizedValue) {
    values.add(normalizedValue);
  }
}

function cleanMatchRegistrationPlayerName(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRegistrationAliasKey(value: string) {
  return cleanMatchRegistrationPlayerName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getMatchRival(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function getClubHomeAway(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? "Local" : "Visitante";
}

function formatCompetitionKind(kind: LeagueFixtureMatch["competitionKind"]) {
  if (kind === "cup") {
    return "Copa";
  }

  if (kind === "friendly") {
    return "Amistoso";
  }

  return "Liga";
}

function getMatchRegistrationStatusKey({
  date,
  rival,
  sourceType,
}: {
  date: string;
  rival: string;
  sourceType: LeagueFixtureMatch["competitionKind"];
}) {
  return [date, normalizeRegistrationRivalKey(rival), sourceType].join("|");
}

function normalizeRegistrationRivalKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(club|asociacion deportiva|asoc deportiva)\s+/, "");
}
