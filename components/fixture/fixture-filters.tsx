"use client";

import { ListChecks } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { LeagueTournamentOption } from "@/types/fixture";

interface FixtureFiltersProps {
  availableYears: number[];
  selectedCompetitionKey: string;
  selectedYear: number;
  tournaments: LeagueTournamentOption[];
}

export function FixtureFilters({
  availableYears,
  selectedCompetitionKey,
  selectedYear,
  tournaments,
}: FixtureFiltersProps) {
  const [year, setYear] = useState(selectedYear);
  const competitionsByYear = useMemo(
    () =>
      Object.fromEntries(
        availableYears.map((availableYear) => [
          availableYear,
          tournaments.filter(
            (tournament) => getTournamentYear(tournament.name) === availableYear,
          ),
        ]),
      ) as Record<number, LeagueTournamentOption[]>,
    [availableYears, tournaments],
  );
  const currentCompetitions = competitionsByYear[year] ?? [];
  const firstCompetitionKey = getFirstCompetitionKey(currentCompetitions);
  const selectedCompetitionIsInYear = currentCompetitions.some((tournament) =>
    tournament.categories.some(
      (category) => `${tournament.id}:${category.id}` === selectedCompetitionKey,
    ),
  );
  const [competitionKey, setCompetitionKey] = useState(
    selectedCompetitionIsInYear
      ? selectedCompetitionKey
      : (firstCompetitionKey ?? selectedCompetitionKey),
  );

  return (
    <form className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto]" method="GET">
      <label className="grid gap-2 text-sm font-medium">
        <span className="text-muted-foreground text-xs font-semibold uppercase">Año</span>
        <select
          name="year"
          value={year}
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            const nextCompetitions = competitionsByYear[nextYear] ?? [];

            setYear(nextYear);
            setCompetitionKey(getFirstCompetitionKey(nextCompetitions) ?? "");
          }}
          className="border-input bg-background focus:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          {availableYears.map((availableYear) => (
            <option key={availableYear} value={availableYear}>
              {availableYear}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-medium">
        <span className="text-muted-foreground text-xs font-semibold uppercase">
          Competencia
        </span>
        <select
          name="competition"
          value={competitionKey}
          onChange={(event) => setCompetitionKey(event.target.value)}
          className="border-input bg-background focus:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          {currentCompetitions.map((tournament) => (
            <optgroup key={tournament.id} label={tournament.name}>
              {tournament.categories.map((category) => (
                <option
                  key={`${tournament.id}:${category.id}`}
                  value={`${tournament.id}:${category.id}`}
                >
                  {category.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex items-end">
        <Button className="w-full sm:w-auto">
          <ListChecks />
          Ver
        </Button>
      </div>
    </form>
  );
}

function getFirstCompetitionKey(tournaments: LeagueTournamentOption[]) {
  const tournament = tournaments.find((item) => item.categories.length > 0);
  const category = tournament?.categories[0];

  return tournament && category ? `${tournament.id}:${category.id}` : undefined;
}

function getTournamentYear(name: string) {
  return Number(/\b(20\d{2})\b/.exec(name)?.[1] ?? 0);
}
