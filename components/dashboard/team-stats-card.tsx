"use client";

import { BarChart3, ShieldCheck, Target, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildCompetitionOptions, filterMatches, buildTeamStats } from "@/lib/team-stats";
import type { LeagueFixtureMatch } from "@/types/fixture";

interface TeamStatsCardProps {
  className?: string;
  matches: LeagueFixtureMatch[];
  selectedCompetitionKey: string;
  selectedYear: number;
  teamName: string;
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
        {stats.unreportedMatches > 0 ? (
          <p role="status" className="text-muted-foreground text-sm">
            Hay {stats.unreportedMatches} partidos anteriores sin resultado publicado en
            la liga. Las estadísticas cuentan los partidos con marcador disponible.
          </p>
        ) : null}
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

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
