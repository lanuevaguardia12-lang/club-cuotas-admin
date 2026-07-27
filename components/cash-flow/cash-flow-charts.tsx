"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
    <section className="grid gap-4 xl:grid-cols-2">
      <CashFlowMatrix charts={charts} />

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Cash flow mensual</CardTitle>
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
                  dataKey="cashBalance"
                  name="Saldo acumulado"
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

      <Card>
        <CardHeader>
          <CardTitle>Mes a mes del año</CardTitle>
          <p className="text-muted-foreground text-sm">
            Evolución mensual con ingresos, gastos por concepto y alerta bajo cero.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
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
                  name="Balance mensual"
                  stroke={chartColors.balance}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="cashBalance"
                  name="Saldo acumulado"
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

      <Card>
        <CardHeader>
          <CardTitle>Detalle por concepto</CardTitle>
        </CardHeader>
        <CardContent>
          {charts.conceptBreakdown.length === 0 ? (
            <div className="border-border text-muted-foreground flex h-80 items-center justify-center rounded-lg border border-dashed p-4 text-sm">
              Sin movimientos para el período.
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.conceptBreakdown}
                  layout="vertical"
                  margin={{ left: 12, right: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={formatCompactCurrency}
                  />
                  <YAxis
                    type="category"
                    dataKey="concept"
                    width={130}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                  <ReferenceLine x={0} stroke={chartColors.zero} strokeDasharray="4 4" />
                  <Bar dataKey="signedAmount" name="Concepto" radius={[4, 4, 4, 4]}>
                    {charts.conceptBreakdown.map((item) => (
                      <Cell
                        key={`${item.type}-${item.concept}`}
                        fill={
                          item.type === "income"
                            ? chartColors.feeIncome
                            : chartColors.expenses
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function CashFlowMatrix({ charts }: CashFlowChartsProps) {
  const periods = charts.annual.map((point) => point.period);
  const incomeRows = charts.matrixRows.filter((row) => row.type === "income");
  const expenseRows = charts.matrixRows.filter((row) => row.type === "expense");

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Cash flow anual</CardTitle>
        <p className="text-muted-foreground text-sm">
          Ingresos, gastos y saldo final mes a mes.
        </p>
      </CardHeader>
      <CardContent>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#012f77] text-white">
                <th className="w-44 border px-3 py-2 text-left font-semibold">
                  Concepto
                </th>
                {charts.annual.map((point) => (
                  <th
                    key={point.period}
                    className="min-w-32 border px-3 py-2 text-right font-semibold"
                  >
                    {point.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SectionTitle label="Ingresos" tone="income" colSpan={periods.length + 1} />
              {incomeRows.length > 0 ? (
                incomeRows.map((row) => (
                  <MatrixConceptRow
                    key={`income-${row.concept}`}
                    row={row}
                    periods={periods}
                  />
                ))
              ) : (
                <EmptyMatrixRow label="Sin ingresos" periods={periods} />
              )}
              <MatrixTotalRow
                label="Total ingresos"
                periods={periods}
                values={Object.fromEntries(
                  charts.annual.map((point) => [point.period, point.ingresos]),
                )}
                tone="income"
              />

              <SectionTitle label="Gastos" tone="expense" colSpan={periods.length + 1} />
              {expenseRows.length > 0 ? (
                expenseRows.map((row) => (
                  <MatrixConceptRow
                    key={`expense-${row.concept}`}
                    row={row}
                    periods={periods}
                  />
                ))
              ) : (
                <EmptyMatrixRow label="Sin gastos" periods={periods} />
              )}
              <MatrixTotalRow
                label="Total gastos"
                periods={periods}
                values={Object.fromEntries(
                  charts.annual.map((point) => [point.period, point.gastos]),
                )}
                tone="expense"
              />
              <MatrixTotalRow
                label="Total cashflow"
                periods={periods}
                values={Object.fromEntries(
                  charts.annual.map((point) => [point.period, point.cashBalance]),
                )}
                tone="cash"
              />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  colSpan,
  label,
  tone,
}: {
  colSpan: number;
  label: string;
  tone: "income" | "expense";
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`border px-3 py-2 text-center text-sm font-bold uppercase ${
          tone === "income"
            ? "bg-emerald-100 text-emerald-950"
            : "bg-rose-100 text-rose-950"
        }`}
      >
        {label}
      </td>
    </tr>
  );
}

function MatrixConceptRow({
  periods,
  row,
}: {
  periods: string[];
  row: CashFlowChartsData["matrixRows"][number];
}) {
  return (
    <tr>
      <td className="bg-background border px-3 py-2 font-medium">{row.concept}</td>
      {periods.map((period) => (
        <td key={period} className="border px-3 py-2 text-right">
          {formatMatrixCurrency(row.values[period] ?? 0)}
        </td>
      ))}
    </tr>
  );
}

function EmptyMatrixRow({ label, periods }: { label: string; periods: string[] }) {
  return (
    <tr>
      <td className="text-muted-foreground border px-3 py-2">{label}</td>
      {periods.map((period) => (
        <td key={period} className="text-muted-foreground border px-3 py-2 text-right">
          -
        </td>
      ))}
    </tr>
  );
}

function MatrixTotalRow({
  label,
  periods,
  tone,
  values,
}: {
  label: string;
  periods: string[];
  tone: "income" | "expense" | "cash";
  values: Record<string, number>;
}) {
  const rowTone =
    tone === "income"
      ? "bg-emerald-100 text-emerald-950"
      : tone === "expense"
        ? "bg-rose-100 text-rose-950"
        : "bg-blue-100 text-blue-950";

  return (
    <tr className={rowTone}>
      <td className="border px-3 py-2 font-bold uppercase">{label}</td>
      {periods.map((period) => (
        <td key={period} className="border px-3 py-2 text-right font-semibold">
          {formatMatrixCurrency(values[period] ?? 0)}
        </td>
      ))}
    </tr>
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
    cashBalance: "Saldo acumulado",
    feeIncome: "Cuotas jugadores",
    ingresos: "Ingresos",
    gastos: "Gastos",
    balance: "Balance",
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

function formatMatrixCurrency(value: number) {
  if (Math.abs(value) < 0.01) {
    return "-";
  }

  return formatCurrency(value);
}
