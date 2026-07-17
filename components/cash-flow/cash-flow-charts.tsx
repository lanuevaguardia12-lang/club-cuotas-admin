"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CashFlowChartsData } from "@/types/dashboard";

interface CashFlowChartsProps {
  charts: CashFlowChartsData;
}

const chartColors = {
  income: "#012f77",
  expenses: "#c10202",
  balance: "#0094dc",
};

export function CashFlowCharts({ charts }: CashFlowChartsProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Gráfico mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts.monthly} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={formatCompactCurrency}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend formatter={legendFormatter} />
                <Bar dataKey="ingresos" fill={chartColors.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" fill={chartColors.expenses} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={chartColors.balance}
                  strokeWidth={3}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gráfico anual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts.annual} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={formatCompactCurrency}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend formatter={legendFormatter} />
                <Bar dataKey="ingresos" fill={chartColors.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" fill={chartColors.expenses} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={chartColors.balance}
                  strokeWidth={3}
                  dot
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  borderColor: "var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
};

function tooltipFormatter(value: unknown, name: unknown) {
  return [formatCurrency(Number(value ?? 0)), legendFormatter(String(name))] as [
    string,
    string,
  ];
}

function legendFormatter(value: string) {
  const labels: Record<string, string> = {
    ingresos: "Ingresos",
    gastos: "Gastos",
    balance: "Balance",
  };

  return labels[value] ?? value;
}

function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  if (absoluteValue >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }

  return `$${value}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
