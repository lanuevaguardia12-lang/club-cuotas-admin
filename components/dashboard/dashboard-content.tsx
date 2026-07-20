"use client";

import dynamic from "next/dynamic";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DashboardChartsData, PlayerTableRow } from "@/types/dashboard";

interface DashboardContentProps {
  charts: DashboardChartsData;
  period: string;
  players: PlayerTableRow[];
}

const DashboardCharts = dynamic(
  () =>
    import("@/components/dashboard/dashboard-charts").then((mod) => mod.DashboardCharts),
  {
    loading: () => <ChartsLoading />,
    ssr: false,
  },
);

const PlayersTable = dynamic(
  () => import("@/components/dashboard/players-table").then((mod) => mod.PlayersTable),
  {
    loading: () => <PlayersTableLoading />,
    ssr: false,
  },
);

export function DashboardContent({ charts, period, players }: DashboardContentProps) {
  return (
    <>
      <DashboardCharts charts={charts} />
      <PlayersTable rows={players} period={period} />
    </>
  );
}

function ChartsLoading() {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="bg-muted h-5 w-40 animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="bg-muted h-80 w-full animate-pulse rounded-md" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function PlayersTableLoading() {
  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <div className="bg-muted h-5 w-44 animate-pulse rounded" />
          <div className="bg-muted h-4 w-72 max-w-full animate-pulse rounded" />
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px] lg:w-[660px]">
          <div className="bg-muted h-10 animate-pulse rounded-md" />
          <div className="bg-muted h-10 animate-pulse rounded-md" />
          <div className="bg-muted h-10 animate-pulse rounded-md" />
        </div>
      </div>
      <Card>
        <CardContent className="grid gap-3 pt-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-muted h-12 animate-pulse rounded-md" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
