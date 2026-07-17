"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardChartsData } from "@/types/dashboard";

interface DashboardChartsProps {
  charts: DashboardChartsData;
}

type MonthlyMode = "income" | "fees";
type AnnualMode = "income" | "fees";

const chartColors = {
  income: "#012f77",
  paid: "#0094dc",
  pending: "#f4ce0f",
  overdue: "#c10202",
  newPlayers: "#16a34a",
  droppedPlayers: "#c10202",
  activePlayers: "#0094dc",
};

const statusColors = [chartColors.income, chartColors.pending, chartColors.overdue];

export function DashboardCharts({ charts }: DashboardChartsProps) {
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>("income");
  const [annualMode, setAnnualMode] = useState<AnnualMode>("income");

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Ingresos por mes</CardTitle>
          <SegmentedControl
            value={monthlyMode}
            options={[
              { label: "Ingresos", value: "income" },
              { label: "Cuotas", value: "fees" },
            ]}
            onChange={setMonthlyMode}
          />
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {monthlyMode === "income" ? (
                <AreaChart
                  data={charts.monthlyCollections}
                  margin={{ left: 0, right: 8 }}
                >
                  <defs>
                    <linearGradient
                      id="monthlyIncomeGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={chartColors.income}
                        stopOpacity={0.32}
                      />
                      <stop offset="95%" stopColor={chartColors.income} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={formatCompactCurrency}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    stroke={chartColors.income}
                    strokeWidth={3}
                    fill="url(#monthlyIncomeGradient)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={charts.monthlyCollections} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                  <Legend formatter={legendFormatter} />
                  <Bar dataKey="cobradas" fill={chartColors.paid} radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="pendientes"
                    fill={chartColors.pending}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="morosas"
                    fill={chartColors.overdue}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Comparativa anual</CardTitle>
          <SegmentedControl
            value={annualMode}
            options={[
              { label: "Ingresos", value: "income" },
              { label: "Cuotas", value: "fees" },
            ]}
            onChange={setAnnualMode}
          />
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {annualMode === "income" ? (
                <ComposedChart
                  data={charts.annualComparison}
                  margin={{ left: 0, right: 8 }}
                >
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
                  <Bar
                    dataKey="ingresos"
                    fill={chartColors.income}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cobradas"
                    stroke={chartColors.paid}
                    strokeWidth={3}
                  />
                </ComposedChart>
              ) : (
                <BarChart data={charts.annualComparison} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                  <Legend formatter={legendFormatter} />
                  <Bar dataKey="cobradas" fill={chartColors.paid} radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="pendientes"
                    fill={chartColors.pending}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="morosas"
                    fill={chartColors.overdue}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Morosidad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={charts.delinquencyTrend}
                margin={{ left: 0, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend formatter={legendFormatter} />
                <Bar
                  yAxisId="left"
                  dataKey="morosos"
                  fill={chartColors.overdue}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="porcentaje"
                  stroke={chartColors.pending}
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
          <CardTitle>Jugadores nuevos y bajas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts.playerLifecycle} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend formatter={legendFormatter} />
                <Bar
                  dataKey="nuevos"
                  fill={chartColors.newPlayers}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="bajas"
                  fill={chartColors.droppedPlayers}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="activos"
                  stroke={chartColors.activePlayers}
                  strokeWidth={3}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Distribución operativa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 lg:grid-cols-[240px_1fr_1fr]">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.feeStatus}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {charts.feeStatus.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={statusColors[index % statusColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <LegendList entries={charts.feeStatus} colors={statusColors} />
            <LegendList entries={charts.playerStatus} colors={statusColors} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SegmentedControl<TValue extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
}) {
  return (
    <div className="bg-muted flex rounded-md p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange(option.value)}
          className="h-8"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function LegendList({
  colors,
  entries,
}: {
  colors: string[];
  entries: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="grid content-center gap-3">
      {entries.map((entry, index) => (
        <div key={entry.label} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: colors[index % colors.length],
              }}
            />
            <span className="text-muted-foreground truncate text-sm">{entry.label}</span>
          </div>
          <span className="text-sm font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  borderColor: "var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
};

function tooltipFormatter(value: unknown, name: unknown) {
  const key = String(name);
  const numericValue = Number(value ?? 0);

  return [
    key === "ingresos" ? formatCurrency(numericValue) : formatInteger(numericValue),
    legendFormatter(key),
  ] as [string, string];
}

function legendFormatter(value: string) {
  const labels: Record<string, string> = {
    activos: "Activos",
    bajas: "Bajas",
    cobradas: "Cobradas",
    ingresos: "Ingresos",
    morosas: "Morosas",
    morosos: "Morosos",
    nuevos: "Nuevos",
    pendientes: "Pendientes",
    porcentaje: "Morosidad %",
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value);
}
