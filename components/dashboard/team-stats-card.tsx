"use client";

import { BarChart3, ShieldCheck, Target, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeagueFixtureMatch } from "@/types/fixture";

interface TeamStatsCardProps {
  className?: string;
  matches: LeagueFixtureMatch[];
  selectedCompetitionKey: string;
  selectedYear: number;
  teamName: string;
}

type OutcomeKind = "draw" | "loss" | "none" | "win";

interface CompetitionOption {
  key: string;
  label: string;
  year: number;
}

export function TeamStatsCard({
  className,
  matches,
  selectedCompetitionKey,
  selectedYear,
  teamName,
}: TeamStatsCardProps) {
  const competitionOptions = useMemo(() => buildCompetitionOptions(matches), [matches]);
  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(
          [selectedYear, ...competitionOptions.map((option) => option.year)].filter(
            Boolean,
          ),
        ),
      ).sort((left, right) => right - left),
    [competitionOptions, selectedYear],
  );
  const [yearFilter, setYearFilter] = useState(String(selectedYear || "all"));
  const [selectedCompetitionKeys, setSelectedCompetitionKeys] = useState<string[]>(
    selectedCompetitionKey ? [selectedCompetitionKey] : [],
  );
  const visibleCompetitionOptions = competitionOptions.filter(
    (option) => yearFilter === "all" || option.year === Number(yearFilter),
  );
  const filteredMatches = useMemo(
    () =>
      filterMatches({
        matches,
        selectedCompetitionKeys,
        teamName,
        yearFilter,
      }),
    [matches, selectedCompetitionKeys, teamName, yearFilter],
  );
  const stats = useMemo(
    () => buildTeamStats(filteredMatches, teamName),
    [filteredMatches, teamName],
  );
  const activeCompetitionLabel =
    selectedCompetitionKeys.length === 0
      ? "Todas las competencias"
      : `${selectedCompetitionKeys.length} competencia${
          selectedCompetitionKeys.length === 1 ? "" : "s"
        }`;

  return (
    <Card className={cn("club-animate-fade-up overflow-hidden", className)}>
      <CardHeader className="gap-4 pb-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="text-primary size-5" />
              Estadísticas de tu equipo
            </CardTitle>
            <p className="text-muted-foreground mt-2 text-sm">
              {activeCompetitionLabel} · {stats.played} partidos con resultado
            </p>
          </div>
          <label className="text-sm font-medium">
            <span className="sr-only">Año</span>
            <select
              className="border-input bg-background focus:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 sm:w-36"
              value={yearFilter}
              onChange={(event) => {
                setYearFilter(event.target.value);
                setSelectedCompetitionKeys([]);
              }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
              <option value="all">Todos los años</option>
            </select>
          </label>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            type="button"
            variant={selectedCompetitionKeys.length === 0 ? "default" : "outline"}
            onClick={() => setSelectedCompetitionKeys([])}
          >
            <Trophy />
            Todas
          </Button>
          {visibleCompetitionOptions.map((option) => {
            const selected = selectedCompetitionKeys.includes(option.key);

            return (
              <Button
                key={option.key}
                size="sm"
                type="button"
                variant={selected ? "default" : "outline"}
                onClick={() =>
                  setSelectedCompetitionKeys((current) =>
                    current.includes(option.key)
                      ? current.filter((key) => key !== option.key)
                      : [...current, option.key],
                  )
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          <StatPill label="PJ" value={stats.played} />
          <StatPill tone="success" label="Victorias" value={stats.wins} />
          <StatPill tone="warning" label="Empates" value={stats.draws} />
          <StatPill tone="danger" label="Derrotas" value={stats.losses} />
          <StatPill label="Efectividad" value={`${stats.effectiveness}%`} />
          <StatPill label="GF" value={stats.goalsFor} />
          <StatPill label="GC" value={stats.goalsAgainst} />
          <StatPill label="Triunfos local" value={stats.homeWins} />
          <StatPill label="Triunfos visita" value={stats.awayWins} />
          <StatPill label="Vallas invictas" value={stats.cleanSheets} />
        </div>

        {stats.played > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="gap-1.5" variant="secondary">
              <Target className="size-3.5" />
              Diferencia {formatSigned(stats.goalDifference)}
            </Badge>
            <Badge className="gap-1.5" variant="secondary">
              <ShieldCheck className="size-3.5" />
              {stats.cleanSheetRate}% con arco en cero
            </Badge>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No hay partidos con resultado para el filtro seleccionado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatPill({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: number | string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "warning" && "border-yellow-200 bg-yellow-50 text-yellow-900",
        tone === "danger" && "border-red-200 bg-red-50 text-red-900",
        tone === "neutral" && "border-border bg-muted/50",
      )}
    >
      <p className="text-muted-foreground text-[0.68rem] font-semibold tracking-normal uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-black tracking-normal">{value}</p>
    </div>
  );
}

function buildCompetitionOptions(matches: LeagueFixtureMatch[]) {
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

function filterMatches({
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

function buildTeamStats(matches: LeagueFixtureMatch[], teamName: string) {
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

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
