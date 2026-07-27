"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
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
  additionalIncome: "#f4ce0f",
  cashBalance: "#012f77",
  feeIncome: "#0094dc",
  income: "#012f77",
  expenses: "#c10202",
  balance: "#0094dc",
  zero: "var(--muted-foreground)",
};

export function CashFlowCharts({ charts }: CashFlowChartsProps) {
  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Cashflow mes a mes</CardTitle>
          <p className="text-muted-foreground text-sm">
            Ingresos y gastos por concepto con saldo final arrastrado mes a mes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts.annual} margin={{ left: 0, right: 8 }}>
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
                <ReferenceLine y={0} stroke={chartColors.zero} strokeDasharray="4 4" />
                <Bar
                  dataKey="feeIncome"
                  name="Cuotas jugadores"
                  stackId="income"
                  fill={chartColors.feeIncome}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="additionalIncome"
                  name="Ingresos extra"
                  stackId="income"
                  fill={chartColors.additionalIncome}
                  radius={[4, 4, 0, 0]}
                />
                {charts.monthlySeries.map((series) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    stackId="expenses"
                    fill={series.color}
                    radius={[0, 0, 4, 4]}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Resultado del mes"
                  stroke={chartColors.balance}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="cashBalance"
                  name="Saldo final"
                  stroke={chartColors.cashBalance}
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="negativeCashBalance"
                  name="Saldo bajo 0"
                  stroke={chartColors.expenses}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  connectNulls={false}
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
  const label = legendFormatter(String(name));
  const numericValue = Number(value ?? 0);
  const shouldShowAbsolute = numericValue < 0 && !/balance|saldo/i.test(label);

  return [
    formatCurrency(shouldShowAbsolute ? Math.abs(numericValue) : numericValue),
    label,
  ] as [string, string];
}

function legendFormatter(value: string) {
  const labels: Record<string, string> = {
    additionalIncome: "Ingresos extra",
    cashBalance: "Saldo final",
    feeIncome: "Cuotas jugadores",
    ingresos: "Ingresos",
    gastos: "Gastos",
    balance: "Resultado del mes",
    negativeCashBalance: "Saldo bajo 0",
    signedAmount: "Concepto",
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
