import type { LeagueFixtureMatch } from "@/types/fixture";

type OutcomeKind = "draw" | "loss" | "none" | "win";

interface CompetitionOption {
  key: string;
  label: string;
  year: number;
}

export function buildCompetitionOptions(matches: LeagueFixtureMatch[]) {
  const optionsByKey = new Map<string, CompetitionOption>();

  for (const match of matches) {
    const key = getMatchCompetitionKey(match);
    const year = getMatchYear(match);

    if (!key || !year || optionsByKey.has(key)) {
      continue;
    }

    optionsByKey.set(key, {
      key,
      label: getShortCompetitionLabel(match),
      year,
    });
  }

  return Array.from(optionsByKey.values()).sort(
    (left, right) => right.year - left.year || left.label.localeCompare(right.label),
  );
}

export function filterMatches({
  matches,
  selectedCompetitionKeys,
  teamName,
  yearFilter,
}: {
  matches: LeagueFixtureMatch[];
  selectedCompetitionKeys: string[];
  teamName: string;
  yearFilter: string;
}) {
  const selectedKeys = new Set(selectedCompetitionKeys);

  return matches.filter((match) => {
    if (!isTeamInMatch(match, teamName)) {
      return false;
    }

    if (yearFilter !== "all" && getMatchYear(match) !== Number(yearFilter)) {
      return false;
    }

    return selectedKeys.size === 0 || selectedKeys.has(getMatchCompetitionKey(match));
  });
}

export function buildTeamStats(matches: LeagueFixtureMatch[], teamName: string) {
  const playedMatches = matches.filter(
    (match) =>
      match.status === "played" &&
      typeof match.localScore === "number" &&
      typeof match.visitorScore === "number",
  );
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let homeWins = 0;
  let awayWins = 0;
  let cleanSheets = 0;

  for (const match of playedMatches) {
    const isLocal = areSameFixtureTeam(match.localTeam, teamName);
    const teamScore = isLocal ? (match.localScore ?? 0) : (match.visitorScore ?? 0);
    const rivalScore = isLocal ? (match.visitorScore ?? 0) : (match.localScore ?? 0);
    const outcome = getTeamMatchOutcomeKind(match, teamName);

    goalsFor += teamScore;
    goalsAgainst += rivalScore;

    if (rivalScore === 0) {
      cleanSheets += 1;
    }

    if (outcome === "win") {
      wins += 1;

      if (isLocal) {
        homeWins += 1;
      } else {
        awayWins += 1;
      }
    } else if (outcome === "draw") {
      draws += 1;
    } else if (outcome === "loss") {
      losses += 1;
    }
  }

  const played = playedMatches.length;
  const points = wins * 3 + draws;
  const effectiveness = played > 0 ? Math.round((points / (played * 3)) * 100) : 0;
  const cleanSheetRate = played > 0 ? Math.round((cleanSheets / played) * 100) : 0;

  return {
    awayWins,
    cleanSheetRate,
    cleanSheets,
    draws,
    effectiveness,
    goalDifference: goalsFor - goalsAgainst,
    goalsAgainst,
    goalsFor,
    homeWins,
    losses,
    played,
    unreportedMatches: matches.filter((match) => match.status === "without-result")
      .length,
    wins,
  };
}

function getTeamMatchOutcomeKind(
  match: LeagueFixtureMatch,
  teamName: string,
): OutcomeKind {
  const isLocal = areSameFixtureTeam(match.localTeam, teamName);
  const teamScore = isLocal ? match.localScore : match.visitorScore;
  const rivalScore = isLocal ? match.visitorScore : match.localScore;
  const teamPenaltyScore = isLocal ? match.localPenaltyScore : match.visitorPenaltyScore;
  const rivalPenaltyScore = isLocal ? match.visitorPenaltyScore : match.localPenaltyScore;

  if (
    match.status !== "played" ||
    typeof teamScore !== "number" ||
    typeof rivalScore !== "number"
  ) {
    return "none";
  }

  if (teamScore > rivalScore) {
    return "win";
  }

  if (teamScore < rivalScore) {
    return "loss";
  }

  if (
    typeof teamPenaltyScore === "number" &&
    typeof rivalPenaltyScore === "number" &&
    teamPenaltyScore !== rivalPenaltyScore
  ) {
    return teamPenaltyScore > rivalPenaltyScore ? "win" : "loss";
  }

  return "draw";
}

function getShortCompetitionLabel(match: LeagueFixtureMatch) {
  const normalized = removeAccents(match.competitionName).toLowerCase();

  if (normalized.includes("apertura")) {
    return `Apertura ${getMatchYear(match)}`;
  }

  if (normalized.includes("clausura")) {
    return `Clausura ${getMatchYear(match)}`;
  }

  if (normalized.includes("copa")) {
    return `Copa ${getMatchYear(match)}`;
  }

  if (normalized.includes("amistoso")) {
    return `Amistosos ${getMatchYear(match)}`;
  }

  return `${match.competitionName} ${getMatchYear(match)}`;
}

function getMatchCompetitionKey(match: LeagueFixtureMatch) {
  const [tournamentId, categoryId] = match.id.split(":");

  return tournamentId && categoryId
    ? `${tournamentId}:${categoryId}`
    : `${normalizeKey(match.competitionName)}:${normalizeKey(match.categoryName)}`;
}

function getMatchYear(match: LeagueFixtureMatch) {
  const competitionYear = Number(/\b(20\d{2})\b/.exec(match.competitionName)?.[1]);

  if (Number.isFinite(competitionYear) && competitionYear > 0) {
    return competitionYear;
  }

  const dateYear = Number(match.dateIso?.slice(0, 4));

  return Number.isFinite(dateYear) && dateYear > 0 ? dateYear : 0;
}

function isTeamInMatch(match: LeagueFixtureMatch, teamName: string) {
  return (
    areSameFixtureTeam(match.localTeam, teamName) ||
    areSameFixtureTeam(match.visitorTeam, teamName)
  );
}

function areSameFixtureTeam(left: string, right: string) {
  return normalizeKey(left) === normalizeKey(right);
}

function normalizeKey(value: string) {
  return removeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(club|asociacion deportiva|asoc deportiva)\s+/, "");
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
