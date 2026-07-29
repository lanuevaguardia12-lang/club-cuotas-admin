"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
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

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CashFlowChartsData,
  CashFlowMatrixRow,
  CashFlowMonthlyPoint,
  CashFlowTransactionType,
} from "@/types/dashboard";

interface CashFlowChartsProps {
  charts: CashFlowChartsData;
  selectedPeriod: string;
}

interface CashFlowDetailRow {
  amount: number;
  concept: string;
  type: CashFlowTransactionType;
}

const chartColors = {
  cashBalance: "#012f77",
  income: "#0094dc",
  expenses: "#c10202",
  negativeCashBalance: "#c10202",
  selected: "#64748b",
  zero: "var(--muted-foreground)",
};

export function CashFlowCharts({ charts, selectedPeriod }: CashFlowChartsProps) {
  const [activePeriod, setActivePeriod] = useState(selectedPeriod);
  const selectedMonth =
    charts.annual.find((point) => point.period === activePeriod) ??
    charts.annual.find((point) => point.period === selectedPeriod) ??
    charts.annual[0];
  const detailRows = useMemo(
    () =>
      selectedMonth
        ? buildDetailRows(charts.matrixRows, selectedMonth.period)
        : { expenses: [], income: [] },
    [charts.matrixRows, selectedMonth],
  );

  useEffect(() => {
    setActivePeriod(selectedPeriod);
  }, [selectedPeriod]);

  function handleChartClick(event: unknown) {
    const period = getClickedPeriod(event);

    if (period) {
      setActivePeriod(period);
    }
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow mes a mes</CardTitle>
          <p className="text-muted-foreground text-sm">
            Barras positivas de ingresos y costos, con saldo final acumulado. Solo se
            marca bajo cero cuando el saldo acumulado queda negativo.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={charts.annual}
                margin={{ left: 0, right: 8 }}
                onClick={handleChartClick}
              >
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
                {selectedMonth ? (
                  <ReferenceLine
                    x={selectedMonth.label}
                    stroke={chartColors.selected}
                    strokeDasharray="4 4"
                  />
                ) : null}
                <Bar
                  dataKey="ingresos"
                  name="Ingresos"
                  fill={chartColors.income}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="gastos"
                  name="Costos"
                  fill={chartColors.expenses}
                  radius={[4, 4, 0, 0]}
                />
                <Area
                  type="monotone"
                  dataKey="negativeCashBalance"
                  name="Saldo bajo 0"
                  stroke={chartColors.negativeCashBalance}
                  fill={chartColors.negativeCashBalance}
                  fillOpacity={0.18}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="cashBalance"
                  name="Saldo final acumulado"
                  stroke={chartColors.cashBalance}
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Tocá un mes del gráfico para ver el detalle de ingresos y costos.
          </p>
        </CardContent>
      </Card>

      {selectedMonth ? (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Detalle de {formatPeriod(selectedMonth.period)}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Apertura del mes seleccionado en el gráfico.
              </p>
            </div>
            <Badge variant={selectedMonth.cashBalance < 0 ? "danger" : "success"}>
              Saldo final {formatCurrency(selectedMonth.cashBalance)}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <DetailMetric
                label="Saldo inicial"
                value={formatSignedCurrency(selectedMonth.openingCashBalance)}
              />
              <DetailMetric
                label="Ingresos"
                value={formatCurrency(selectedMonth.ingresos)}
              />
              <DetailMetric label="Costos" value={formatCurrency(selectedMonth.gastos)} />
              <DetailMetric
                label="Resultado"
                value={formatSignedCurrency(selectedMonth.balance)}
              />
              <DetailMetric
                label="Saldo final"
                value={formatSignedCurrency(selectedMonth.cashBalance)}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DetailList
                emptyText="Sin ingresos registrados para este mes."
                rows={detailRows.income}
                title="Ingresos"
                type="income"
              />
              <DetailList
                emptyText="Sin costos registrados para este mes."
                rows={detailRows.expenses}
                title="Costos"
                type="expense"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  borderColor: "var(--border)",
  background: "var(--card)",
  color: "var(--card-foreground)",
};

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailList({
  emptyText,
  rows,
  title,
  type,
}: {
  emptyText: string;
  rows: CashFlowDetailRow[];
  title: string;
  type: CashFlowTransactionType;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="border-border bg-background rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Badge variant={type === "income" ? "success" : "danger"}>
          {formatCurrency(total)}
        </Badge>
      </div>
      {rows.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {rows.map((row) => (
            <div
              key={`${row.type}-${row.concept}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-muted-foreground min-w-0 truncate">
                {row.concept}
              </span>
              <span className="shrink-0 font-medium">{formatCurrency(row.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">{emptyText}</p>
      )}
    </section>
  );
}

function buildDetailRows(matrixRows: CashFlowMatrixRow[], period: string) {
  const rows = matrixRows
    .map<CashFlowDetailRow>((row) => ({
      amount: row.values[period] ?? 0,
      concept: row.concept,
      type: row.type,
    }))
    .filter((row) => row.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  return {
    expenses: rows.filter((row) => row.type === "expense"),
    income: rows.filter((row) => row.type === "income"),
  };
}

function getClickedPeriod(event: unknown) {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const activePayload = (
    event as {
      activePayload?: Array<{
        payload?: CashFlowMonthlyPoint;
      }>;
    }
  ).activePayload;

  return activePayload?.[0]?.payload?.period;
}

function tooltipFormatter(value: unknown, name: unknown) {
  const label = legendFormatter(String(name));
  const numericValue = Number(value ?? 0);

  return [formatCurrency(numericValue), label] as [string, string];
}

function legendFormatter(value: string) {
  const labels: Record<string, string> = {
    cashBalance: "Saldo final acumulado",
    ingresos: "Ingresos",
    gastos: "Costos",
    negativeCashBalance: "Saldo bajo 0",
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

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatCurrency(value)}`;
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
