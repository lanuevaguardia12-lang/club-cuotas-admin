"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLoadingRouter } from "@/hooks/use-loading-router";

interface DashboardPeriodSelectorProps {
  period: string;
}

export function DashboardPeriodSelector({ period }: DashboardPeriodSelectorProps) {
  const router = useLoadingRouter();

  function goToPeriod(nextPeriod: string) {
    if (!/^\d{4}-\d{2}$/.test(nextPeriod) || nextPeriod === period) {
      return;
    }

    router.push(`/?period=${nextPeriod}`, "Cargando dashboard del mes...");
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mes anterior"
        onClick={() => goToPeriod(addMonths(period, -1))}
      >
        <ChevronLeft />
      </Button>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Mes de cuotas</span>
        <input
          type="month"
          value={period}
          onChange={(event) => goToPeriod(event.target.value)}
          className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mes siguiente"
        onClick={() => goToPeriod(addMonths(period, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function addMonths(period: string, monthsToAdd: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
