import type { LeagueFixtureMatch } from "@/types/fixture";

export function formatRepeatedGoalLabels(
  labels: LeagueFixtureMatch["goals"],
): string[] {
  const goalsByKey = new Map<string, FormattedGoalLabel>();

  for (const label of labels) {
    const parsed = parseGoalLabel(label);
    const existing = goalsByKey.get(parsed.key);

    if (existing) {
      existing.count += parsed.count;
      continue;
    }

    goalsByKey.set(parsed.key, parsed);
  }

  return [...goalsByKey.values()].map(formatGoalLabel);
}

export function parseGoalCountMarker(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const markerMatch =
    /(?:^|[^\p{L}\p{N}])(?:x|×)\s*(\d{1,2})(?=$|[^\p{L}\p{N}])/iu.exec(
      normalized,
    ) ?? /\b(\d{1,2})\s*goles?\b/i.exec(normalized);

  if (!markerMatch) {
    return 1;
  }

  const count = Number(markerMatch[1]);

  return Number.isInteger(count) && count > 0 && count <= 20 ? count : 1;
}

export function stripGoalCountMarker(value: string) {
  return value
    .replace(/\(\s*(?:x|×)\s*\d{1,2}\s*\)/giu, "")
    .replace(
      /(^|[^\p{L}\p{N}])(?:x|×)\s*\d{1,2}(?=$|[^\p{L}\p{N}])/giu,
      "$1",
    )
    .replace(/\b\d{1,2}\s*goles?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface FormattedGoalLabel {
  count: number;
  key: string;
  kind: "parenthesized" | "prefixed" | "plain";
  ownGoal?: boolean;
  playerName: string;
  teamName?: string;
}

function parseGoalLabel(label: string): FormattedGoalLabel {
  const count = parseGoalCountMarker(label);
  const cleanLabel = stripGoalCountMarker(label);
  const parenthesized = /^(.+?)\s*\((.+)\)$/.exec(cleanLabel);

  if (parenthesized) {
    const playerName = parenthesized[1]?.trim() ?? cleanLabel;
    const detail = parenthesized[2]?.trim() ?? "";
    const ownGoal = /(?:^|,)\s*e\/c\s*$/i.test(detail);
    const teamName = detail.replace(/,\s*e\/c\s*$/i, "").trim();

    return {
      count,
      key: buildGoalKey(playerName, teamName, ownGoal),
      kind: "parenthesized",
      ownGoal,
      playerName,
      teamName,
    };
  }

  const prefixed = /^([^:]+):\s*(.+)$/.exec(cleanLabel);

  if (prefixed) {
    const teamName = prefixed[1]?.trim() ?? "";
    const playerName = prefixed[2]?.trim() ?? cleanLabel;

    return {
      count,
      key: buildGoalKey(playerName, teamName),
      kind: "prefixed",
      playerName,
      teamName,
    };
  }

  return {
    count,
    key: buildGoalKey(cleanLabel),
    kind: "plain",
    playerName: cleanLabel,
  };
}

function formatGoalLabel(goal: FormattedGoalLabel) {
  const scorer = goal.count > 1 ? `${goal.playerName} x${goal.count}` : goal.playerName;

  if (goal.kind === "parenthesized" && goal.teamName) {
    return `${scorer} (${goal.teamName}${goal.ownGoal ? ", e/c" : ""})`;
  }

  if (goal.kind === "prefixed" && goal.teamName) {
    return `${goal.teamName}: ${scorer}`;
  }

  return scorer;
}

function buildGoalKey(playerName: string, teamName = "", ownGoal = false) {
  return [
    normalizeGoalKey(playerName),
    normalizeGoalKey(teamName),
    ownGoal ? "own-goal" : "goal",
  ].join("|");
}

function normalizeGoalKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
