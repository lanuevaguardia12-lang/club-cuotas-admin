"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useLoadingRouter } from "@/hooks/use-loading-router";

interface DashboardPeriodSelectorProps {
  period: string;
}

export function DashboardPeriodSelector({ period }: DashboardPeriodSelectorProps) {
  const router = useLoadingRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPeriod(nextPeriod: string) {
    if (!/^\d{4}-\d{2}$/.test(nextPeriod) || nextPeriod === period) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    params.set("period", nextPeriod);
    router.push(`${pathname}?${params.toString()}`, "Cargando dashboard del mes...");
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-end gap-2 sm:w-auto sm:shrink-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mes anterior"
        onClick={() => goToPeriod(addMonths(period, -1))}
      >
        <ChevronLeft />
      </Button>
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">Mes de cuotas</span>
        <input
          type="month"
          value={period}
          onChange={(event) => goToPeriod(event.target.value)}
          className="border-input bg-background focus:ring-ring h-10 w-full min-w-0 appearance-none rounded-md border px-2 text-base outline-none focus:ring-2 sm:w-44 sm:text-sm"
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
