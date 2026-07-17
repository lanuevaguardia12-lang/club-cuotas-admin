"use client";

import dynamic from "next/dynamic";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CashFlowChartsData } from "@/types/dashboard";

interface CashFlowContentProps {
  charts: CashFlowChartsData;
}

const CashFlowCharts = dynamic(
  () =>
    import("@/components/cash-flow/cash-flow-charts").then((mod) => mod.CashFlowCharts),
  {
    loading: () => <CashFlowChartsLoading />,
    ssr: false,
  },
);

export function CashFlowContent({ charts }: CashFlowContentProps) {
  return <CashFlowCharts charts={charts} />;
}

function CashFlowChartsLoading() {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="bg-muted h-5 w-36 animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="bg-muted h-80 w-full animate-pulse rounded-md" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
