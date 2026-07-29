"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertTriangle,
  CircleDollarSign,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import {
  deleteCashFlowTransaction,
  saveCashFlowTransaction,
} from "@/app/(dashboard)/cash-flow/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import { useLoadingRouter } from "@/hooks/use-loading-router";
import type {
  CashFlowData,
  CashFlowMatrixRow,
  CashFlowMonthlyPoint,
  CashFlowTransaction,
  CashFlowTransactionType,
} from "@/types/dashboard";

interface CashFlowContentProps {
  canWrite: boolean;
  data: CashFlowData;
}

const transactionSchema = z
  .object({
    id: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha."),
    period: z.string().regex(/^\d{4}-\d{2}$/, "Elegí un mes."),
    type: z.enum(["income", "expense"]),
    concept: z.string().trim().min(2, "Ingresá un concepto.").max(140),
    amount: z.number().positive("El monto debe ser mayor a cero."),
    repeatsMonthly: z.boolean(),
    startPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Elegí mes inicial."),
    endPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Elegí mes final."),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.endPeriod >= value.startPeriod, {
    message: "El mes final no puede ser anterior al inicial.",
    path: ["endPeriod"],
  });

type TransactionFormValues = z.infer<typeof transactionSchema>;

const CashFlowCharts = dynamic(
  () =>
    import("@/components/cash-flow/cash-flow-charts").then((mod) => mod.CashFlowCharts),
  {
    loading: () => <CashFlowChartsLoading />,
    ssr: false,
  },
);

const typeLabels: Record<CashFlowTransactionType, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

export function CashFlowContent({ canWrite, data }: CashFlowContentProps) {
  const router = useRouter();
  const loadingRouter = useLoadingRouter();
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [message, setMessage] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: getDefaultValues(data.period),
  });
  const repeatsMonthly = watch("repeatsMonthly");
  const manualTransactions = useMemo(
    () =>
      data.transactions
        .filter((transaction) => transaction.source === "manual")
        .sort((left, right) => right.period.localeCompare(left.period)),
    [data.transactions],
  );
  const selectedMonth =
    data.charts.annual.find((point) => point.period === data.period) ??
    data.charts.monthly.find((point) => point.period === data.period);
  const nextCriticalMonth = data.charts.annual.find((point) => point.cashBalance < 0);

  function handlePeriodChange(period: string) {
    if (period === data.period) {
      return;
    }

    loadingRouter.push(`/cash-flow?period=${period}`, "Cargando Cash Flow...");
  }

  async function onSubmit(values: TransactionFormValues) {
    setMessage("");
    setLoadingMessage(
      values.id ? "Actualizando movimiento..." : "Guardando movimiento...",
    );
    const normalizedValues = values.repeatsMonthly
      ? values
      : {
          ...values,
          startPeriod: values.period,
          endPeriod: values.period,
        };

    try {
      await saveCashFlowTransaction(normalizedValues);
      reset(getDefaultValues(data.period));
      setEditingId("");
      setMessage(values.id ? "Movimiento actualizado" : "Movimiento guardado");
      router.refresh();
      window.setTimeout(() => setMessage(""), 2200);
    } finally {
      setLoadingMessage("");
    }
  }

  function handleEdit(transaction: CashFlowTransaction) {
    setEditingId(transaction.id);
    reset({
      id: transaction.id,
      date: transaction.date ?? `${transaction.period}-01`,
      period: transaction.period,
      type: transaction.type,
      concept: transaction.concept,
      amount: transaction.amount,
      repeatsMonthly: transaction.repeatsMonthly,
      startPeriod: transaction.startPeriod,
      endPeriod: transaction.endPeriod,
      notes: transaction.notes,
    });
    document
      .getElementById("cash-flow-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId("");
    reset(getDefaultValues(data.period));
  }

  function startInitialBalance(type: CashFlowTransactionType) {
    setEditingId("");
    reset({
      ...getDefaultValues(data.period),
      concept:
        type === "income" ? "Saldo inicial de caja" : "Ajuste saldo inicial negativo",
      date: `${data.period}-01`,
      period: data.period,
      type,
      notes: "Saldo real de caja cargado como punto de partida.",
    });
    document
      .getElementById("cash-flow-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDelete(transaction: CashFlowTransaction) {
    if (!window.confirm(`¿Eliminar ${transaction.concept}?`)) {
      return;
    }

    setDeletingId(transaction.id);
    setLoadingMessage(`Eliminando ${transaction.concept}...`);

    try {
      await deleteCashFlowTransaction(transaction.id);
      setMessage("Movimiento eliminado");
      router.refresh();
      window.setTimeout(() => setMessage(""), 2200);
    } finally {
      setDeletingId("");
      setLoadingMessage("");
    }
  }

  return (
    <section className="grid gap-6">
      <LoadingModal open={Boolean(loadingMessage)} description={loadingMessage} />

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Periodo financiero</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Las cuotas esperadas salen del calculador para el mes elegido.
            </p>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Mes</span>
            <input
              type="month"
              value={data.period}
              onChange={(event) => handlePeriodChange(event.target.value)}
              className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            />
          </label>
        </CardHeader>
      </Card>

      <CashFlowCharts charts={data.charts} />

      <CashFlowGeneralSummary
        annual={data.charts.annual}
        nextCriticalMonth={nextCriticalMonth}
      />

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Editar movimiento" : "Nuevo movimiento"}</CardTitle>
            <p className="text-muted-foreground text-sm">
              Cargá ingresos y gastos adicionales para simular escenarios.
            </p>
          </CardHeader>
          <CardContent>
            <form
              id="cash-flow-form"
              className="grid gap-4"
              onSubmit={handleSubmit(onSubmit)}
            >
              <input type="hidden" {...register("id")} />
              {editingId ? (
                <div className="border-primary/30 bg-primary/10 text-primary flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>Editando movimiento</span>
                  <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                    <X />
                    Cancelar
                  </Button>
                </div>
              ) : null}

              <Field label="Concepto" error={errors.concept?.message}>
                <input
                  {...register("concept")}
                  disabled={!canWrite}
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo" error={errors.type?.message}>
                  <select
                    {...register("type")}
                    disabled={!canWrite}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  >
                    <option value="income">Ingreso</option>
                    <option value="expense">Gasto</option>
                  </select>
                </Field>

                <Field label="Monto" error={errors.amount?.message}>
                  <input
                    type="number"
                    min={0}
                    step="0.000001"
                    {...register("amount", { valueAsNumber: true })}
                    disabled={!canWrite}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Fecha" error={errors.date?.message}>
                  <input
                    type="date"
                    {...register("date")}
                    disabled={!canWrite}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Mes" error={errors.period?.message}>
                  <input
                    type="month"
                    {...register("period")}
                    disabled={!canWrite}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>
              </div>

              <label className="border-border bg-background flex min-h-10 items-center justify-between gap-3 rounded-md border px-3">
                <span className="text-sm font-medium">Movimiento recurrente</span>
                <input
                  type="checkbox"
                  {...register("repeatsMonthly")}
                  disabled={!canWrite}
                  className="accent-primary size-5"
                />
              </label>

              {repeatsMonthly ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Repite desde" error={errors.startPeriod?.message}>
                    <input
                      type="month"
                      {...register("startPeriod")}
                      disabled={!canWrite}
                      className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                    />
                  </Field>
                  <Field label="Repite hasta" error={errors.endPeriod?.message}>
                    <input
                      type="month"
                      {...register("endPeriod")}
                      disabled={!canWrite}
                      className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                    />
                  </Field>
                </div>
              ) : null}

              <Field label="Notas" error={errors.notes?.message}>
                <textarea
                  {...register("notes")}
                  disabled={!canWrite}
                  rows={3}
                  className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                />
              </Field>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="submit" disabled={!canWrite || isSubmitting}>
                  {editingId ? <Save /> : <Plus />}
                  {editingId ? "Actualizar" : "Guardar"}
                </Button>
                {message ? (
                  <span className="text-primary text-sm font-medium">{message}</span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <CashFlowTransactionsList
          canWrite={canWrite}
          deletingId={deletingId}
          onDelete={handleDelete}
          onEdit={handleEdit}
          transactions={manualTransactions}
        />
      </div>

      <CashFlowMonthSummary
        canWrite={canWrite}
        matrixRows={data.charts.matrixRows}
        onInitialBalance={startInitialBalance}
        selectedMonth={selectedMonth}
      />
    </section>
  );
}

function CashFlowTransactionsList({
  canWrite,
  deletingId,
  onDelete,
  onEdit,
  transactions,
}: {
  canWrite: boolean;
  deletingId: string;
  onDelete: (transaction: CashFlowTransaction) => void;
  onEdit: (transaction: CashFlowTransaction) => void;
  transactions: CashFlowTransaction[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos adicionales</CardTitle>
        <p className="text-muted-foreground text-sm">
          Ingresos y gastos manuales. Las cuotas esperadas no se editan acá.
        </p>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed p-4">
            <h3 className="font-semibold">Sin movimientos adicionales</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Cargá gastos o ingresos extra para completar el cash flow.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="border-border bg-background grid gap-3 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{transaction.concept}</h3>
                      <Badge
                        variant={transaction.type === "income" ? "success" : "danger"}
                      >
                        {typeLabels[transaction.type]}
                      </Badge>
                      {transaction.repeatsMonthly ? (
                        <Badge variant="secondary">Recurrente</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {transaction.repeatsMonthly
                        ? `${formatPeriod(transaction.startPeriod)} a ${formatPeriod(transaction.endPeriod)}`
                        : formatPeriod(transaction.period)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">
                    {formatCurrency(transaction.amount)}
                  </p>
                </div>
                {transaction.notes ? (
                  <p className="text-muted-foreground text-sm">{transaction.notes}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canWrite}
                    onClick={() => onEdit(transaction)}
                  >
                    <Pencil />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canWrite || deletingId === transaction.id}
                    onClick={() => onDelete(transaction)}
                  >
                    <Trash2 />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CashFlowGeneralSummary({
  annual,
  nextCriticalMonth,
}: {
  annual: CashFlowMonthlyPoint[];
  nextCriticalMonth?: CashFlowMonthlyPoint;
}) {
  const totalIncome = annual.reduce((total, point) => total + point.ingresos, 0);
  const totalExpenses = annual.reduce((total, point) => total + point.gastos, 0);
  const annualBalance = totalIncome - totalExpenses;
  const finalBalance = annual.at(-1)?.cashBalance ?? 0;
  const positiveMonths = annual.filter((point) => point.balance >= 0).length;
  const state =
    finalBalance < 0
      ? {
          detail: "El año proyecta caja negativa si se mantiene este escenario.",
          label: "Riesgo de caja",
          variant: "danger" as const,
        }
      : annualBalance < 0
        ? {
            detail: "El año pierde plata, pero la caja final sigue positiva.",
            label: "Año deficitario",
            variant: "warning" as const,
          }
        : {
            detail: "El año cierra con resultado positivo.",
            label: "Caja sana",
            variant: "success" as const,
          };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Resumen operativo general</CardTitle>
          <Badge variant={state.variant}>{state.label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{state.detail}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryItem label="Ingresos año" value={totalIncome} />
        <SummaryItem label="Gastos año" value={totalExpenses} mode="expense" />
        <SummaryItem label="Resultado año" value={annualBalance} mode="signed" />
        <SummaryItem label="Saldo final año" value={finalBalance} mode="signed" strong />
        <div className="border-border bg-background rounded-md border p-3">
          <p className="text-muted-foreground text-xs font-medium">Meses positivos</p>
          <p className="mt-2 text-lg font-semibold">
            {positiveMonths}/{annual.length}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {nextCriticalMonth
              ? `Primer alerta: ${formatPeriod(nextCriticalMonth.period)}`
              : "Sin meses con caja negativa"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CashFlowMonthSummary({
  canWrite,
  matrixRows,
  onInitialBalance,
  selectedMonth,
}: {
  canWrite: boolean;
  matrixRows: CashFlowMatrixRow[];
  onInitialBalance: (type: CashFlowTransactionType) => void;
  selectedMonth?: CashFlowMonthlyPoint;
}) {
  if (!selectedMonth) {
    return null;
  }

  const state = getFinancialState(selectedMonth);
  const incomeRows = getRowsForPeriod(matrixRows, selectedMonth.period, "income");
  const expenseRows = getRowsForPeriod(matrixRows, selectedMonth.period, "expense");

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              Resumen operativo de {formatPeriod(selectedMonth.period)}
            </CardTitle>
            <Badge variant={state.variant}>{state.label}</Badge>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">{state.detail}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite}
            onClick={() => onInitialBalance("income")}
          >
            <CircleDollarSign />
            Saldo inicial
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite}
            onClick={() => onInitialBalance("expense")}
          >
            <AlertTriangle />
            Deuda inicial
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryItem
            label="Saldo inicial"
            value={selectedMonth.openingCashBalance}
            mode="signed"
          />
          <SummaryItem label="Ingresos" value={selectedMonth.ingresos} />
          <SummaryItem label="Gastos" value={selectedMonth.gastos} mode="expense" />
          <SummaryItem
            label="Resultado mes"
            value={selectedMonth.balance}
            mode="signed"
          />
          <SummaryItem
            label="Saldo final"
            value={selectedMonth.cashBalance}
            mode="signed"
            strong
          />
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <ConceptBreakdown title="Ingresos del mes" rows={incomeRows} />
          <ConceptBreakdown title="Gastos del mes" rows={expenseRows} isExpense />
        </section>
      </CardContent>
    </Card>
  );
}

function ConceptBreakdown({
  isExpense = false,
  rows,
  title,
}: {
  isExpense?: boolean;
  rows: Array<{ amount: number; concept: string }>;
  title: string;
}) {
  return (
    <div className="border-border bg-background rounded-md border">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-muted-foreground text-xs">{rows.length} conceptos</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-3 py-4 text-sm">Sin movimientos.</p>
      ) : (
        <div className="divide-border divide-y">
          {rows.map((row) => (
            <div
              key={row.concept}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{row.concept}</span>
              <span
                className={
                  isExpense
                    ? "text-destructive font-semibold"
                    : "font-semibold text-emerald-700 dark:text-emerald-300"
                }
              >
                {formatCurrency(isExpense ? -row.amount : row.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryItem({
  label,
  mode = "positive",
  strong = false,
  value,
}: {
  label: string;
  mode?: "positive" | "expense" | "signed";
  strong?: boolean;
  value: number;
}) {
  const signedTone =
    value < 0
      ? "text-destructive"
      : value > 0
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-muted-foreground";
  const tone =
    mode === "expense"
      ? value > 0
        ? "text-destructive"
        : "text-muted-foreground"
      : mode === "signed"
        ? signedTone
        : value > 0
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground";

  return (
    <div className="border-border bg-background rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={`mt-2 text-lg ${strong ? "font-bold" : "font-semibold"} ${tone}`}>
        {formatCurrency(mode === "expense" ? -value : value)}
      </p>
    </div>
  );
}

function getRowsForPeriod(
  rows: CashFlowMatrixRow[],
  period: string,
  type: CashFlowTransactionType,
) {
  return rows
    .filter((row) => row.type === type)
    .map((row) => ({
      amount: row.values[period] ?? 0,
      concept: row.concept,
    }))
    .filter((row) => row.amount > 0)
    .sort((left, right) => right.amount - left.amount);
}

function getFinancialState(month: CashFlowMonthlyPoint) {
  if (month.cashBalance < 0) {
    return {
      detail: "El saldo final del mes queda negativo.",
      label: "Caja negativa",
      variant: "danger" as const,
    };
  }

  if (month.balance < 0) {
    return {
      detail: "El mes pierde plata, pero el saldo acumulado sigue positivo.",
      label: "Mes deficitario",
      variant: "warning" as const,
    };
  }

  return {
    detail: "El mes cierra positivo y la caja queda a favor.",
    label: "Caja positiva",
    variant: "success" as const,
  };
}

function Field({
  children,
  error,
  label,
}: Readonly<{
  children: React.ReactNode;
  error?: string;
  label: string;
}>) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </label>
  );
}

function CashFlowChartsLoading() {
  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="bg-muted h-5 w-44 animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-[420px] w-full animate-pulse rounded-md" />
        </CardContent>
      </Card>
    </section>
  );
}

function getDefaultValues(period: string): TransactionFormValues {
  return {
    amount: 0,
    concept: "",
    date: `${period}-01`,
    endPeriod: period,
    period,
    repeatsMonthly: false,
    startPeriod: period,
    type: "expense",
    notes: "",
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
