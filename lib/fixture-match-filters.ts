import type { LeagueFixtureRound, LeagueStandingRow } from "@/types/fixture";

export const ALL_FIXTURE_OPTIONS = "all";
export const NO_FIXTURE_OPTIONS = "none";

export function getFixtureRoundKey(round: LeagueFixtureRound) {
  return `${round.name}-${round.date}`;
}

export function getFixtureTeamNames(
  rounds: LeagueFixtureRound[],
  standings: LeagueStandingRow[],
) {
  return Array.from(
    new Set([
      ...standings.map((row) => row.teamName.trim()),
      ...rounds.flatMap((round) =>
        round.matches.flatMap((match) => [
          match.localTeam.trim(),
          match.visitorTeam.trim(),
        ]),
      ),
    ]),
  )
    .filter((name) => name && !/^(libre|bye)$/i.test(name))
    .sort((left, right) => left.localeCompare(right, "es-AR"));
}

export function resolveFixtureSelection(
  requested: string[],
  available: string[],
  defaults: string[] = available,
) {
  if (!requested.length) return defaults;
  if (requested.includes(NO_FIXTURE_OPTIONS)) return [];
  if (requested.includes(ALL_FIXTURE_OPTIONS)) return available;
  const valid = new Set(available);
  return Array.from(new Set(requested.filter((value) => valid.has(value))));
}

export function serializeFixtureSelection(selected: string[], available: string[]) {
  if (!selected.length) return [NO_FIXTURE_OPTIONS];
  const selectedValues = new Set(selected);
  return available.every((value) => selectedValues.has(value))
    ? [ALL_FIXTURE_OPTIONS]
    : selected;
}

export function filterFixtureRounds(
  rounds: LeagueFixtureRound[],
  roundKeys: string[],
  teams: string[],
) {
  const visibleRounds = new Set(roundKeys);
  const visibleTeams = new Set(teams);
  return rounds
    .filter((round) => visibleRounds.has(getFixtureRoundKey(round)))
    .map((round) => ({
      ...round,
      matches: round.matches.filter(
        (match) =>
          visibleTeams.has(match.localTeam.trim()) ||
          visibleTeams.has(match.visitorTeam.trim()),
      ),
    }))
    .filter((round) => round.matches.length > 0);
}
