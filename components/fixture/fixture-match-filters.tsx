"use client";

import { ChevronDown, ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { serializeFixtureSelection } from "@/lib/fixture-match-filters";

export interface FixtureFilterOption {
  value: string;
  label: string;
  description?: string;
}

interface FixtureMatchFiltersProps {
  competitionKey: string;
  year: number;
  roundOptions: FixtureFilterOption[];
  teamOptions: FixtureFilterOption[];
  selectedRoundKeys: string[];
  selectedTeamNames: string[];
}

export function FixtureMatchFilters({
  competitionKey,
  year,
  roundOptions,
  teamOptions,
  selectedRoundKeys,
  selectedTeamNames,
}: FixtureMatchFiltersProps) {
  const [rounds, setRounds] = useState(selectedRoundKeys);
  const [teams, setTeams] = useState(selectedTeamNames);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="border-border bg-card grid min-w-0 gap-3 rounded-lg border p-3 sm:flex sm:flex-wrap sm:items-end"
      method="GET"
      action="/fixture"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        new FormData(event.currentTarget).forEach((value, name) => {
          if (typeof value === "string") params.append(name, value);
        });
        startTransition(() =>
          router.push(`/fixture?${params.toString()}`, { scroll: false }),
        );
      }}
    >
      <input name="competition" type="hidden" value={competitionKey} />
      <input name="year" type="hidden" value={year} />
      <input name="tab" type="hidden" value="fixture" />
      {serializeFixtureSelection(
        rounds,
        roundOptions.map((option) => option.value),
      ).map((value) => (
        <input key={value} name="round" type="hidden" value={value} />
      ))}
      {serializeFixtureSelection(
        teams,
        teamOptions.map((option) => option.value),
      ).map((value) => (
        <input key={value} name="team" type="hidden" value={value} />
      ))}
      <MultiSelectFilter
        label="Fechas"
        allLabel="Todas"
        emptyLabel="Sin fechas"
        countLabel="fechas"
        options={roundOptions}
        selected={rounds}
        onChange={setRounds}
      />
      <MultiSelectFilter
        label="Equipo"
        allLabel="Todos"
        emptyLabel="Sin equipos"
        countLabel="equipos"
        options={teamOptions}
        selected={teams}
        onChange={setTeams}
      />
      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={isPending}
        aria-busy={isPending}
      >
        <ListFilter aria-hidden="true" />
        {isPending ? "Aplicando..." : "Aplicar filtros"}
      </Button>
    </form>
  );
}

function MultiSelectFilter({
  label,
  allLabel,
  emptyLabel,
  countLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  emptyLabel: string;
  countLabel: string;
  options: FixtureFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const selectedValues = new Set(selected);
  const allSelected =
    options.length > 0 && options.every((option) => selectedValues.has(option.value));
  const summary = allSelected
    ? allLabel
    : selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
        : `${selected.length} ${countLabel}`;

  useEffect(() => {
    if (allRef.current)
      allRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [allSelected, open, selected.length]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target))
        setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative grid min-w-0 gap-1.5 sm:w-64">
      <span className="text-sm font-medium">{label}</span>
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        className="w-full min-w-0 justify-between px-3"
        aria-label={`${label}: ${summary}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={open ? "rotate-180" : undefined} aria-hidden="true" />
      </Button>
      {open ? (
        <fieldset
          id={panelId}
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-30 mt-1 w-full min-w-0 rounded-lg border p-2 shadow-lg"
        >
          <legend className="sr-only">{label}</legend>
          <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold">
            <input
              ref={allRef}
              type="checkbox"
              className="accent-primary size-4 shrink-0"
              checked={allSelected}
              onChange={() =>
                onChange(allSelected ? [] : options.map((option) => option.value))
              }
            />
            {allLabel}
          </label>
          <div className="border-border my-1 border-t" />
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {options.map((option) => (
              <label
                key={option.value}
                className="hover:bg-accent flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-4 shrink-0"
                  checked={selectedValues.has(option.value)}
                  onChange={() =>
                    onChange(
                      selectedValues.has(option.value)
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value],
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  <span className="block">{option.label}</span>
                  {option.description ? (
                    <span className="text-muted-foreground block text-xs">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
