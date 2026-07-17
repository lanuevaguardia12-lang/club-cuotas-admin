"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CircleDollarSign,
  ListChecks,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  deleteFeeCalculatorCost,
  saveFeeCalculatorActual,
  saveFeeCalculatorCost,
} from "@/app/(dashboard)/fee-calculator/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FeeCalculatorCost,
  FeeCalculatorCostType,
  FeeCalculatorData,
  FeePlayerCalculation,
} from "@/types/fee-calculator";

interface FeeCalculatorContentProps {
  data: FeeCalculatorData;
}

const costSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Ingresá un nombre.").max(120),
    type: z.enum(["fixed", "court", "custom"]),
    startPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Elegí el mes de inicio."),
    endPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Elegí el mes de fin."),
    amount: z.number().min(0, "El monto no puede ser negativo."),
    repeatsMonthly: z.boolean(),
    splitBetween: z.number().int().min(1, "Debe dividirse por al menos 1."),
    forecastUnits: z.number().min(0, "La cantidad no puede ser negativa."),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.endPeriod >= value.startPeriod, {
    message: "El mes de fin no puede ser anterior al inicio.",
    path: ["endPeriod"],
  });

type CostFormValues = z.infer<typeof costSchema>;

const typeLabels: Record<FeeCalculatorCostType, string> = {
  court: "Cancha",
  custom: "Variable",
  fixed: "Fijo",
};

export function FeeCalculatorContent({ data }: FeeCalculatorContentProps) {
  const router = useRouter();
  const [savingMessage, setSavingMessage] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CostFormValues>({
    resolver: zodResolver(costSchema),
    defaultValues: getDefaultCostValues(data),
  });
  const selectedType = watch("type");
  const courtCosts = data.costs.filter((cost) => cost.type === "court");
  const sortedCalculations = useMemo(
    () =>
      [...data.playerCalculations].sort((left, right) =>
        left.playerName.localeCompare(right.playerName, "es"),
      ),
    [data.playerCalculations],
  );

  async function handleSaveCost(values: CostFormValues) {
    setSavingMessage("");
    await saveFeeCalculatorCost(values);
    reset(getDefaultCostValues(data));
    setSavingMessage("Costo guardado");
    router.refresh();
    window.setTimeout(() => setSavingMessage(""), 2200);
  }

  function applyTemplate(template: "court" | "coach" | "water" | "custom") {
    const splitBetween = data.summary.players || 1;

    if (template === "court") {
      setValue("name", "Cancha");
      setValue("type", "court");
      setValue("amount", 0);
      setValue("forecastUnits", Math.max(data.summary.totalMatchesPreviousPeriod, 1));
      setValue("splitBetween", splitBetween);
      setValue("repeatsMonthly", true);
      setValue("notes", "Costo por jornada. Cargar canchas reales mes a mes.");
      return;
    }

    if (template === "coach") {
      setValue("name", "DT / Profesor");
      setValue("type", "fixed");
      setValue("amount", 0);
      setValue("forecastUnits", 1);
      setValue("splitBetween", splitBetween);
      setValue("repeatsMonthly", true);
      return;
    }

    if (template === "water") {
      setValue("name", "Aguas");
      setValue("type", "fixed");
      setValue("amount", 0);
      setValue("forecastUnits", 1);
      setValue("splitBetween", splitBetween);
      setValue("repeatsMonthly", true);
      return;
    }

    setValue("name", "Otro gasto");
    setValue("type", "custom");
    setValue("amount", 0);
    setValue("forecastUnits", 1);
    setValue("splitBetween", splitBetween);
  }

  function handlePeriodChange(period: string) {
    router.push(`/fee-calculator?period=${period}`);
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Cuota base"
          value={formatCurrency(data.summary.baseQuota)}
          detail={`A calcular en ${formatPeriod(data.period)}`}
        />
        <MetricCard
          icon={CalendarDays}
          label="Costo planificado"
          value={formatCurrency(data.summary.plannedCurrentQuota)}
          detail={`Costos de ${formatPeriod(data.period)}`}
        />
        <MetricCard
          icon={RotateCcw}
          label="Ajuste reales"
          value={formatCurrency(data.summary.previousCostVariance)}
          detail={`Diferencia de ${formatPeriod(data.previousPeriod)}`}
        />
        <MetricCard
          icon={ListChecks}
          label="Partidos"
          value={String(data.summary.totalMatchesPreviousPeriod)}
          detail={`Jugados en ${formatPeriod(data.previousPeriod)}`}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Período de cuota</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              La cuota de este mes usa asistencia, gastos y reales del mes anterior.
            </p>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Cuota a calcular</span>
            <input
              type="month"
              value={data.period}
              onChange={(event) => handlePeriodChange(event.target.value)}
              className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            />
          </label>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Nuevo costo</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <TemplateButton label="Cancha" onClick={() => applyTemplate("court")} />
              <TemplateButton label="DT" onClick={() => applyTemplate("coach")} />
              <TemplateButton label="Aguas" onClick={() => applyTemplate("water")} />
              <TemplateButton label="Otro" onClick={() => applyTemplate("custom")} />
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit(handleSaveCost)}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre del costo" error={errors.name?.message}>
                  <input
                    {...register("name")}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Tipo" error={errors.type?.message}>
                  <select
                    {...register("type")}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  >
                    <option value="fixed">Fijo</option>
                    <option value="court">Cancha</option>
                    <option value="custom">Variable</option>
                  </select>
                </Field>

                <Field
                  label={selectedType === "court" ? "Costo por jornada" : "Monto"}
                  error={errors.amount?.message}
                >
                  <input
                    type="number"
                    min={0}
                    step={1}
                    {...register("amount", { valueAsNumber: true })}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Dividir por personas" error={errors.splitBetween?.message}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    {...register("splitBetween", { valueAsNumber: true })}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Vigencia desde" error={errors.startPeriod?.message}>
                  <input
                    type="month"
                    {...register("startPeriod")}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field label="Vigencia hasta" error={errors.endPeriod?.message}>
                  <input
                    type="month"
                    {...register("endPeriod")}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <Field
                  label={
                    selectedType === "court"
                      ? "Canchas pronosticadas"
                      : "Cantidad estimada"
                  }
                  error={errors.forecastUnits?.message}
                >
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    {...register("forecastUnits", { valueAsNumber: true })}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                </Field>

                <label className="border-border bg-background flex min-h-10 items-center justify-between gap-3 rounded-md border px-3">
                  <span className="text-sm font-medium">Repite todos los meses</span>
                  <input
                    type="checkbox"
                    {...register("repeatsMonthly")}
                    className="accent-primary size-5"
                  />
                </label>
              </div>

              <Field label="Notas" error={errors.notes?.message}>
                <textarea
                  rows={3}
                  {...register("notes")}
                  className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                />
              </Field>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="submit" disabled={isSubmitting}>
                  <Plus />
                  Guardar costo
                </Button>
                {savingMessage ? (
                  <span className="text-primary text-sm font-medium">
                    {savingMessage}
                  </span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Política de devoluciones</CardTitle>
            <p className="text-muted-foreground text-sm">
              Se aplica sobre la cuota base del mes anterior según asistencia.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.refundPolicy.map((rule) => (
              <div
                key={`${rule.fromPercent}-${rule.toPercent}`}
                className="border-border bg-background grid grid-cols-3 items-center gap-2 rounded-md border p-3 text-sm"
              >
                <span>{formatPercent(rule.fromPercent / 100)}</span>
                <span>{formatPercent(rule.toPercent / 100)}</span>
                <Badge variant={rule.refundPercent > 0 ? "warning" : "secondary"}>
                  {formatPercent(rule.refundPercent / 100)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <CostList data={data} />

      {courtCosts.length > 0 ? (
        <ActualCourtsPanel data={data} costs={courtCosts} />
      ) : null}

      <PlayerCalculationsTable rows={sortedCalculations} />
    </section>
  );
}

function CostList({ data }: { data: FeeCalculatorData }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState("");

  if (data.costs.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-5 text-sm">
          Todavía no hay costos cargados para calcular la cuota base.
        </CardContent>
      </Card>
    );
  }

  async function handleDelete(costId: string) {
    setDeletingId(costId);
    await deleteFeeCalculatorCost(costId);
    router.refresh();
    setDeletingId("");
  }

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Costos cargados</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Estos costos alimentan la cuota base según su vigencia.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.costs.map((cost) => (
          <Card key={cost.id}>
            <CardContent className="grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{cost.name}</h3>
                    <Badge variant="secondary">{typeLabels[cost.type]}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {cost.startPeriod} a {cost.endPeriod} ·{" "}
                    {cost.repeatsMonthly ? "mensual" : "una vez"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${cost.name}`}
                  disabled={deletingId === cost.id}
                  onClick={() => handleDelete(cost.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Info label="Monto" value={formatCurrency(cost.amount)} />
                <Info label="Divide" value={String(cost.splitBetween)} />
                <Info
                  label={cost.type === "court" ? "Estimadas" : "Cantidad"}
                  value={formatNumber(cost.forecastUnits)}
                />
                <Info
                  label="Cuota/persona"
                  value={formatCurrency(
                    (cost.type === "court"
                      ? cost.amount * cost.forecastUnits
                      : cost.amount) / Math.max(cost.splitBetween, 1),
                  )}
                />
              </div>
              {cost.notes ? (
                <p className="text-muted-foreground text-sm">{cost.notes}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ActualCourtsPanel({
  costs,
  data,
}: {
  costs: FeeCalculatorCost[];
  data: FeeCalculatorData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canchas reales</CardTitle>
        <p className="text-muted-foreground text-sm">
          Editá lo real de {formatPeriod(data.previousPeriod)}. La diferencia contra lo
          pronosticado ajusta la cuota de {formatPeriod(data.period)}.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {costs.map((cost) => (
          <ActualUnitsForm key={cost.id} cost={cost} data={data} />
        ))}
      </CardContent>
    </Card>
  );
}

function ActualUnitsForm({
  cost,
  data,
}: {
  cost: FeeCalculatorCost;
  data: FeeCalculatorData;
}) {
  const router = useRouter();
  const actual = data.actuals.find(
    (item) => item.costId === cost.id && item.period === data.previousPeriod,
  );
  const [actualUnits, setActualUnits] = useState(
    String(actual?.actualUnits ?? cost.forecastUnits),
  );
  const [notes, setNotes] = useState(actual?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await saveFeeCalculatorActual({
      costId: cost.id,
      period: data.previousPeriod,
      actualUnits: Number(actualUnits),
      notes,
    });
    router.refresh();
    setSaving(false);
  }

  return (
    <form
      className="border-border bg-background grid gap-3 rounded-lg border p-4"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="font-medium">{cost.name}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Pronosticadas: {formatNumber(cost.forecastUnits)}
        </p>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Canchas reales</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={actualUnits}
          onChange={(event) => setActualUnits(event.target.value)}
          className="border-input bg-card focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Nota</span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="border-input bg-card focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
        />
      </label>
      <Button type="submit" size="sm" disabled={saving}>
        <Save />
        Guardar real
      </Button>
    </form>
  );
}

function PlayerCalculationsTable({ rows }: { rows: FeePlayerCalculation[] }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Cuota por jugador</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Cuota base menos devolución por asistencia y gastos pagados por el jugador.
        </p>
      </div>

      <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60">
              <tr className="border-border border-b">
                <TableHead>Jugador</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Partidos</TableHead>
                <TableHead>Devolución</TableHead>
                <TableHead>Gastos</TableHead>
                <TableHead>Cuota final</TableHead>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.playerId} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{row.playerName}</td>
                  <td className="px-4 py-3">{formatCurrency(row.baseQuota)}</td>
                  <td className="px-4 py-3">
                    <MatchDetails row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <div>{formatCurrency(row.refundAmount)}</div>
                    <p className="text-muted-foreground text-xs">
                      {formatPercent(row.refundPercent / 100)}
                    </p>
                  </td>
                  <td className="px-4 py-3">{formatCurrency(row.expenseCredit)}</td>
                  <td className="px-4 py-3 text-base font-semibold">
                    {formatCurrency(row.finalQuota)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <Card key={row.playerId}>
            <CardContent className="grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.playerName}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {row.playedMatches}/{row.totalMatches} partidos
                  </p>
                </div>
                <Badge variant="default">{formatCurrency(row.finalQuota)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Base" value={formatCurrency(row.baseQuota)} />
                <Info label="Devolución" value={formatCurrency(row.refundAmount)} />
                <Info label="Gastos" value={formatCurrency(row.expenseCredit)} />
                <Info label="Asistencia" value={formatPercent(row.attendanceRate)} />
              </div>
              <MatchDetails row={row} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function MatchDetails({ row }: { row: FeePlayerCalculation }) {
  return (
    <details className="group">
      <summary className="text-primary inline-flex cursor-pointer list-none items-center gap-2 font-medium">
        <span>
          {row.playedMatches}/{row.totalMatches}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatPercent(row.attendanceRate)}
        </span>
      </summary>
      <div className="border-border bg-background mt-2 grid gap-1 rounded-md border p-2">
        {row.matches.length > 0 ? (
          row.matches.map((match) => (
            <p key={`${row.playerId}-${match.date}-${match.rival}`} className="text-xs">
              {formatDate(match.date)} · {match.rival}
            </p>
          ))
        ) : (
          <p className="text-muted-foreground text-xs">Sin partidos registrados.</p>
        )}
      </div>
    </details>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        <div className="bg-primary/10 text-primary rounded-md p-2">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TemplateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
      {children}
    </th>
  );
}

function getDefaultCostValues(data: FeeCalculatorData): CostFormValues {
  return {
    name: "",
    type: "fixed",
    startPeriod: data.period,
    endPeriod: data.period,
    amount: 0,
    repeatsMonthly: true,
    splitBetween: data.summary.players || 1,
    forecastUnits: 1,
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
    style: "percent",
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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}
