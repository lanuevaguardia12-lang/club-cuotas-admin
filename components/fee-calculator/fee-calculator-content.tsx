"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CircleDollarSign,
  Copy,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  deleteFeeCalculatorCost,
  saveFeeCalculatorActual,
  saveFeeCalculatorCost,
  saveFeeRefundPolicy,
  updateFeeCalculatorPlayerStatus,
} from "@/app/(dashboard)/fee-calculator/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FeeCalculatorAdjustment,
  FeeCalculatorCost,
  FeeCalculatorCostType,
  FeeCalculatorData,
  FeePlayerCalculation,
  FeeRefundPolicyRule,
} from "@/types/fee-calculator";

interface FeeCalculatorContentProps {
  data: FeeCalculatorData;
}

const costSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Ingresá un nombre.").max(120),
    type: z.enum(["fixed", "court", "coach", "custom"]),
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
  coach: "Director técnico",
  court: "Cancha",
  custom: "Variable",
  fixed: "Fijo",
};

type CostTemplate =
  | "court"
  | "coach"
  | "carnet"
  | "balls"
  | "water"
  | "cashExtra"
  | "oldRecovery"
  | "rounding"
  | "custom";

interface EditableRefundPolicyRow {
  id: string;
  fromPercent: string;
  toPercent: string;
  refundPercent: string;
}

export function FeeCalculatorContent({ data }: FeeCalculatorContentProps) {
  const router = useRouter();
  const [savingMessage, setSavingMessage] = useState("");
  const [editingCostName, setEditingCostName] = useState("");
  const [repeatMonths, setRepeatMonths] = useState<string[]>([]);
  const [repeatMessage, setRepeatMessage] = useState("");
  const [isRepeating, setIsRepeating] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<CostFormValues>({
    resolver: zodResolver(costSchema),
    defaultValues: getDefaultCostValues(data),
  });
  const selectedType = watch("type");
  const trackedActualCosts = useMemo(
    () =>
      data.costs.filter(
        (cost) =>
          ["court", "coach"].includes(cost.type) &&
          isCostActiveInPeriod(cost, data.previousPeriod),
      ),
    [data.costs, data.previousPeriod],
  );
  const repeatableCosts = useMemo(
    () => data.costs.filter((cost) => isCostActiveInPeriod(cost, data.period)),
    [data.costs, data.period],
  );
  const repeatablePeriods = useMemo(
    () => getRepeatablePeriods(data.period),
    [data.period],
  );
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
    setEditingCostName("");
    setSavingMessage(values.id ? "Costo actualizado" : "Costo guardado");
    router.refresh();
    window.setTimeout(() => setSavingMessage(""), 2200);
  }

  function applyTemplate(template: CostTemplate) {
    const splitBetween = data.summary.players || 1;
    const baseValues = {
      ...getDefaultCostValues(data),
      splitBetween,
    };

    if (template === "court") {
      reset({
        ...baseValues,
        name: "Cancha",
        type: "court",
        forecastUnits: Math.max(data.summary.totalLocalMatchesPreviousPeriod, 1),
        notes: "Costo por jornada. Las canchas reales se calculan desde partidos Local.",
      });
      setEditingCostName("");
      return;
    }

    if (template === "coach") {
      reset({
        ...baseValues,
        name: "Director técnico",
        type: "coach",
        amount: 20000,
        forecastUnits: 12,
        notes:
          "Monto por hora. Las horas reales se calculan con Asistió joaco? x 3 horas.",
      });
      setEditingCostName("");
      return;
    }

    if (template === "carnet") {
      reset({ ...baseValues, name: "Carnet", type: "fixed" });
      setEditingCostName("");
      return;
    }

    if (template === "balls") {
      reset({ ...baseValues, name: "Pelotas", type: "fixed" });
      setEditingCostName("");
      return;
    }

    if (template === "water") {
      reset({ ...baseValues, name: "Aguas", type: "fixed" });
      setEditingCostName("");
      return;
    }

    if (template === "cashExtra") {
      reset({ ...baseValues, name: "Adicional Caja", type: "fixed" });
      setEditingCostName("");
      return;
    }

    if (template === "oldRecovery") {
      reset({ ...baseValues, name: "Recupero de gastos viejos", type: "fixed" });
      setEditingCostName("");
      return;
    }

    if (template === "rounding") {
      reset({ ...baseValues, name: "Redondeo", type: "custom" });
      setEditingCostName("");
      return;
    }

    reset({ ...baseValues, name: "Otro gasto", type: "custom" });
    setEditingCostName("");
  }

  function handleEditCost(cost: FeeCalculatorCost) {
    reset({
      id: cost.id,
      name: cost.name,
      type: cost.type,
      startPeriod: cost.startPeriod,
      endPeriod: cost.endPeriod,
      amount: cost.amount,
      repeatsMonthly: cost.repeatsMonthly,
      splitBetween: cost.splitBetween,
      forecastUnits: cost.forecastUnits,
      notes: cost.notes,
    });
    setEditingCostName(cost.name);
    document
      .getElementById("fee-cost-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    reset(getDefaultCostValues(data));
    setEditingCostName("");
  }

  function toggleRepeatMonth(period: string) {
    setRepeatMonths((current) =>
      current.includes(period)
        ? current.filter((item) => item !== period)
        : [...current, period],
    );
  }

  async function handleRepeatStructure() {
    if (repeatMonths.length === 0 || repeatableCosts.length === 0) {
      return;
    }

    setIsRepeating(true);
    setRepeatMessage("");

    for (const period of repeatMonths) {
      for (const cost of repeatableCosts) {
        await saveFeeCalculatorCost({
          name: cost.name,
          type: cost.type,
          startPeriod: period,
          endPeriod: period,
          amount: cost.amount,
          repeatsMonthly: false,
          splitBetween: cost.splitBetween,
          forecastUnits: cost.forecastUnits,
          notes: cost.notes,
        });
      }
    }

    setIsRepeating(false);
    setRepeatMessage("Estructura repetida");
    setRepeatMonths([]);
    router.refresh();
    window.setTimeout(() => setRepeatMessage(""), 2500);
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
          detail={`${data.adjustments.length} conceptos de ${formatPeriod(data.previousPeriod)}`}
        />
        <MetricCard
          icon={ListChecks}
          label="Partidos"
          value={String(data.summary.totalMatchesPreviousPeriod)}
          detail={`${data.summary.totalLocalMatchesPreviousPeriod} locales · ${formatNumber(data.summary.coachHoursPreviousPeriod)} h DT`}
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

      <FeeCalculatorNotice data={data} rows={sortedCalculations} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Nuevo costo</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <TemplateButton label="Cancha" onClick={() => applyTemplate("court")} />
              <TemplateButton label="DT" onClick={() => applyTemplate("coach")} />
              <TemplateButton label="Carnet" onClick={() => applyTemplate("carnet")} />
              <TemplateButton label="Pelotas" onClick={() => applyTemplate("balls")} />
              <TemplateButton label="Aguas" onClick={() => applyTemplate("water")} />
              <TemplateButton
                label="Adicional Caja"
                onClick={() => applyTemplate("cashExtra")}
              />
              <TemplateButton
                label="Recupero"
                onClick={() => applyTemplate("oldRecovery")}
              />
              <TemplateButton
                label="Redondeo"
                onClick={() => applyTemplate("rounding")}
              />
              <TemplateButton label="Otro" onClick={() => applyTemplate("custom")} />
            </div>
          </CardHeader>
          <CardContent>
            <form
              id="fee-cost-form"
              className="grid gap-4"
              onSubmit={handleSubmit(handleSaveCost)}
            >
              <input type="hidden" {...register("id")} />
              {editingCostName ? (
                <div className="border-primary/30 bg-primary/10 text-primary flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>Editando {editingCostName}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                    <X />
                    Cancelar
                  </Button>
                </div>
              ) : null}
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
                    <option value="coach">Director técnico</option>
                    <option value="custom">Variable</option>
                  </select>
                </Field>

                <Field
                  label={
                    selectedType === "court"
                      ? "Costo por jornada"
                      : selectedType === "coach"
                        ? "Costo por hora"
                        : "Monto unitario"
                  }
                  error={errors.amount?.message}
                >
                  <input
                    type="number"
                    min={0}
                    step="0.000001"
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
                      : selectedType === "coach"
                        ? "Horas previstas"
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
                  {editingCostName ? <Save /> : <Plus />}
                  {editingCostName ? "Actualizar costo" : "Guardar costo"}
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

        <RefundPolicyEditor rules={data.refundPolicy} />
      </div>

      <CostList data={data} onEditCost={handleEditCost} />

      <AdjustmentList data={data} />

      <CalculatorPlayersPanel data={data} />

      <RepeatStructurePanel
        costsCount={repeatableCosts.length}
        data={data}
        isRepeating={isRepeating}
        message={repeatMessage}
        onRepeat={handleRepeatStructure}
        onToggleMonth={toggleRepeatMonth}
        periods={repeatablePeriods}
        selectedPeriods={repeatMonths}
      />

      <ActualUnitsPanel data={data} costs={trackedActualCosts} />

      <AttendanceBreakdown data={data} rows={sortedCalculations} />

      <PlayerCalculationsTable rows={sortedCalculations} />
    </section>
  );
}

function FeeCalculatorNotice({
  data,
  rows,
}: {
  data: FeeCalculatorData;
  rows: FeePlayerCalculation[];
}) {
  if (data.source.status === "error") {
    return null;
  }

  if (rows.length === 0) {
    return (
      <Card className="border-destructive/30 bg-destructive/10">
        <CardContent className="p-5">
          <h2 className="text-destructive font-semibold">No hay jugadores activos</h2>
          <p className="text-destructive/90 mt-2 text-sm">
            El calculador usa la base de la hoja Listado jugadores. Cargá jugadores en la
            sección Jugadores y verificá que la Service Account tenga acceso al Sheet.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.summary.activeCosts === 0 || data.summary.baseQuota === 0) {
    return (
      <Card className="border-[#f4ce0f]/50 bg-[#f4ce0f]/10">
        <CardContent className="p-5">
          <h2 className="font-semibold text-[#7a6500] dark:text-[#f4ce0f]">
            Jugadores activos, faltan costos activos
          </h2>
          <p className="mt-2 text-sm text-[#6c5a00] dark:text-[#f4ce0f]/90">
            Ya hay {rows.length} jugadores activos. Para ver cuánto le queda pagar a cada
            uno, cargá costos para {formatPeriod(data.period)} con monto, cantidad
            estimada y cantidad de personas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function RefundPolicyEditor({ rules }: { rules: FeeRefundPolicyRule[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => rules.map(ruleToEditablePolicyRow));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateRow(
    id: string,
    key: keyof Omit<EditableRefundPolicyRow, "id">,
    value: string,
  ) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: `new-${Date.now()}`,
        fromPercent: "0",
        toPercent: "100",
        refundPercent: "0",
      },
    ]);
  }

  function deleteRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    await saveFeeRefundPolicy({
      rules: rows.map((row) => ({
        fromPercent: Number(row.fromPercent),
        toPercent: Number(row.toPercent),
        refundPercent: Number(row.refundPercent),
      })),
    });
    router.refresh();
    setSaving(false);
    setMessage("Política guardada");
    window.setTimeout(() => setMessage(""), 2400);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Política de devoluciones</CardTitle>
        <p className="text-muted-foreground text-sm">
          Se aplica sobre la cuota base del mes anterior según asistencia.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border-border bg-background grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-md border p-3 text-sm"
            >
              <label className="grid gap-1">
                <span className="text-muted-foreground text-xs">Desde %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={row.fromPercent}
                  onChange={(event) =>
                    updateRow(row.id, "fromPercent", event.target.value)
                  }
                  className="border-input bg-card focus:ring-ring h-9 rounded-md border px-2 text-sm outline-none focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground text-xs">Hasta %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={row.toPercent}
                  onChange={(event) => updateRow(row.id, "toPercent", event.target.value)}
                  className="border-input bg-card focus:ring-ring h-9 rounded-md border px-2 text-sm outline-none focus:ring-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground text-xs">Devolución %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={row.refundPercent}
                  onChange={(event) =>
                    updateRow(row.id, "refundPercent", event.target.value)
                  }
                  className="border-input bg-card focus:ring-ring h-9 rounded-md border px-2 text-sm outline-none focus:ring-2"
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Eliminar regla"
                disabled={rows.length === 1}
                onClick={() => deleteRow(row.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus />
            Agregar regla
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}>
            <Save />
            Guardar política
          </Button>
          {message ? (
            <span className="text-primary text-sm font-medium">{message}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function CostList({
  data,
  onEditCost,
}: {
  data: FeeCalculatorData;
  onEditCost: (cost: FeeCalculatorCost) => void;
}) {
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
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${cost.name}`}
                    onClick={() => onEditCost(cost)}
                  >
                    <Pencil />
                  </Button>
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
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <Info label="Monto unitario" value={formatPreciseCurrency(cost.amount)} />
                <Info label="Divide" value={String(cost.splitBetween)} />
                <Info
                  label={getUnitLabel(cost.type)}
                  value={formatNumber(cost.forecastUnits)}
                />
                <Info
                  label="Total"
                  value={formatPreciseCurrency(cost.amount * cost.forecastUnits)}
                />
                <Info
                  label="Cuota/persona"
                  value={formatPreciseCurrency(
                    (cost.amount * cost.forecastUnits) / Math.max(cost.splitBetween, 1),
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

function AdjustmentList({ data }: { data: FeeCalculatorData }) {
  const adjustments = data.adjustments;

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Ajustes automáticos</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Diferencia entre lo pronosticado y lo real de{" "}
          {formatPeriod(data.previousPeriod)}. Impacta en la cuota de{" "}
          {formatPeriod(data.period)}.
        </p>
      </div>

      {adjustments.length === 0 ? (
        <EmptyTableState
          title="Sin ajustes para aplicar"
          description="Cuando las canchas reales u horas reales sean distintas a lo pronosticado, el ajuste aparece aca como importe positivo o negativo."
        />
      ) : (
        <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-muted/60">
                <tr className="border-border border-b">
                  <TableHead>Concepto</TableHead>
                  <TableHead>Periodo real</TableHead>
                  <TableHead>Previsto</TableHead>
                  <TableHead>Real</TableHead>
                  <TableHead>Diferencia</TableHead>
                  <TableHead>Impacto por jugador</TableHead>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr
                    key={adjustment.id}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{adjustment.name}</div>
                      <p className="text-muted-foreground text-xs">
                        {adjustment.sourceCostName}
                      </p>
                    </td>
                    <td className="px-4 py-3">{formatPeriod(adjustment.period)}</td>
                    <td className="px-4 py-3">
                      {formatNumber(adjustment.forecastUnits)}
                    </td>
                    <td className="px-4 py-3">{formatNumber(adjustment.actualUnits)}</td>
                    <td className="px-4 py-3">
                      {formatSignedNumber(adjustment.unitDifference)}
                    </td>
                    <td className="px-4 py-3">
                      <AdjustmentAmountBadge adjustment={adjustment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adjustments.length > 0 ? (
        <div className="grid gap-3 md:hidden">
          {adjustments.map((adjustment) => (
            <Card key={adjustment.id}>
              <CardContent className="grid gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{adjustment.name}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {formatPeriod(adjustment.period)} · {adjustment.sourceCostName}
                    </p>
                  </div>
                  <AdjustmentAmountBadge adjustment={adjustment} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Previsto" value={formatNumber(adjustment.forecastUnits)} />
                  <Info label="Real" value={formatNumber(adjustment.actualUnits)} />
                  <Info
                    label="Diferencia"
                    value={formatSignedNumber(adjustment.unitDifference)}
                  />
                  <Info label="Divide" value={String(adjustment.splitBetween)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AdjustmentAmountBadge({ adjustment }: { adjustment: FeeCalculatorAdjustment }) {
  const isPositive = adjustment.variance > 0;

  return (
    <Badge variant={isPositive ? "danger" : "success"}>
      {formatSignedCurrency(adjustment.variance)}
    </Badge>
  );
}

function CalculatorPlayersPanel({ data }: { data: FeeCalculatorData }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState("");
  const activePlayers = data.players.filter(
    (player) => player.status === "active",
  ).length;
  const inactivePlayers = data.players.length - activePlayers;

  async function updateStatus(
    player: FeeCalculatorData["players"][number],
    status: "active" | "inactive",
  ) {
    setSavingId(player.id);
    await updateFeeCalculatorPlayerStatus({
      playerId: player.id,
      playerName: player.name,
      period: data.period,
      status,
    });
    router.refresh();
    setSavingId("");
  }

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Jugadores del calculador</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          El estado se configura solo para {formatPeriod(data.period)}. Solo los activos
          de ese mes entran en la cuota y en el ingreso esperado del Cash Flow.
          {data.players.length > 0
            ? ` ${activePlayers} activos · ${inactivePlayers} inactivos.`
            : ""}
        </p>
      </div>

      {data.players.length === 0 ? (
        <EmptyTableState
          title="Sin jugadores cargados"
          description="Cargá jugadores en la sección Jugadores para poder calcular cuotas."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.players.map((player) => {
            const isActive = player.status === "active";
            const nextStatus = isActive ? "inactive" : "active";

            return (
              <Card key={player.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{player.name}</h3>
                      <Badge variant={isActive ? "success" : "danger"}>
                        {isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {player.category || "Plantel"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isActive ? "outline" : "default"}
                    size="sm"
                    disabled={savingId === player.id}
                    onClick={() => updateStatus(player, nextStatus)}
                  >
                    {isActive ? "Inactivar" : "Activar"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RepeatStructurePanel({
  costsCount,
  data,
  isRepeating,
  message,
  onRepeat,
  onToggleMonth,
  periods,
  selectedPeriods,
}: {
  costsCount: number;
  data: FeeCalculatorData;
  isRepeating: boolean;
  message: string;
  onRepeat: () => void;
  onToggleMonth: (period: string) => void;
  periods: string[];
  selectedPeriods: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repetir estructura</CardTitle>
        <p className="text-muted-foreground text-sm">
          Copia los costos activos de {formatPeriod(data.period)} como costos
          independientes en los meses elegidos.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {periods.map((period) => {
            const checked = selectedPeriods.includes(period);

            return (
              <button
                key={period}
                type="button"
                onClick={() => onToggleMonth(period)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {formatShortPeriod(period)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={isRepeating || selectedPeriods.length === 0 || costsCount === 0}
            onClick={onRepeat}
          >
            <Copy />
            Repetir en meses seleccionados
          </Button>
          <span className="text-muted-foreground text-sm">
            {costsCount} costos activos para copiar.
          </span>
          {message ? (
            <span className="text-primary text-sm font-medium">{message}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ActualUnitsPanel({
  costs,
  data,
}: {
  costs: FeeCalculatorCost[];
  data: FeeCalculatorData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cantidades reales</CardTitle>
        <p className="text-muted-foreground text-sm">
          Se autocompletan desde el formulario para {formatPeriod(data.previousPeriod)}.
          Podés editarlas si necesitás corregirlas.
        </p>
      </CardHeader>
      <CardContent>
        {costs.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed p-4">
            <h3 className="font-semibold">Sin cantidades reales para cargar</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              No hay costos de cancha o DT vigentes en {formatPeriod(data.previousPeriod)}
              . Para generar ajustes en {formatPeriod(data.period)}, primero tiene que
              existir ese costo en el mes anterior.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {costs.map((cost) => (
              <ActualUnitsForm key={cost.id} cost={cost} data={data} />
            ))}
          </div>
        )}
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
          {getForecastLabel(cost.type)}: {formatNumber(cost.forecastUnits)}
        </p>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium">{getActualLabel(cost.type)}</span>
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

function AttendanceBreakdown({
  data,
  rows,
}: {
  data: FeeCalculatorData;
  rows: FeePlayerCalculation[];
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">
          Asistencia de {formatPeriod(data.previousPeriod)}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {data.summary.totalMatchesPreviousPeriod} partidos jugados en el mes. Este
          porcentaje define la devolución sobre la cuota base calculada por la app para{" "}
          {formatPeriod(data.previousPeriod)}.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyTableState
          title="Sin jugadores para mostrar"
          description="Cuando cargues jugadores activos en la sección Jugadores, vas a ver acá cuántos partidos jugó cada uno y el porcentaje de asistencia."
        />
      ) : (
        <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/60">
                <tr className="border-border border-b">
                  <TableHead>Jugador</TableHead>
                  <TableHead>Partidos del mes</TableHead>
                  <TableHead>Asistió</TableHead>
                  <TableHead>Asistencia</TableHead>
                  <TableHead>Devolución</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.playerId}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium">{row.playerName}</td>
                    <td className="px-4 py-3">{row.totalMatches}</td>
                    <td className="px-4 py-3">
                      <MatchDetails row={row} compact />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.refundPercent > 0 ? "warning" : "success"}>
                        {formatPercent(row.attendanceRate)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div>{formatPercent(row.refundPercent / 100)}</div>
                      <p className="text-muted-foreground text-xs">
                        sobre {formatCurrency(row.previousBaseQuota)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
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
                  <Badge variant={row.refundPercent > 0 ? "warning" : "success"}>
                    {formatPercent(row.attendanceRate)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Partidos del mes" value={String(row.totalMatches)} />
                  <Info label="Asistió" value={String(row.playedMatches)} />
                  <Info
                    label="Devolución"
                    value={formatPercent(row.refundPercent / 100)}
                  />
                  <Info
                    label="Base devolución"
                    value={formatCurrency(row.previousBaseQuota)}
                  />
                </div>
                <MatchDetails row={row} compact />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PlayerCalculationsTable({ rows }: { rows: FeePlayerCalculation[] }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">Cuota por jugador</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Cuota base calculada por la app, con ajustes reales, menos devolución por
          asistencia.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyTableState
          title="Sin cuotas por jugador"
          description="La cuota final aparece cuando existen jugadores activos y costos cargados para el período seleccionado."
        />
      ) : (
        <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/60">
                <tr className="border-border border-b">
                  <TableHead>Jugador</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Partidos</TableHead>
                  <TableHead>Devolución</TableHead>
                  <TableHead>Cuota final</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.playerId}
                    className="border-border border-b last:border-b-0"
                  >
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
                    <td className="px-4 py-3 text-base font-semibold">
                      {formatCurrency(row.finalQuota)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
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
                </div>
                <div className="border-primary/20 bg-primary/5 rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Cuota final</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCurrency(row.finalQuota)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Base" value={formatCurrency(row.baseQuota)} />
                  <Info label="Devolución" value={formatCurrency(row.refundAmount)} />
                  <Info label="Asistencia" value={formatPercent(row.attendanceRate)} />
                </div>
                <MatchDetails row={row} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmptyTableState({ description, title }: { description: string; title: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

function MatchDetails({
  compact = false,
  row,
}: {
  compact?: boolean;
  row: FeePlayerCalculation;
}) {
  return (
    <details className="group">
      <summary className="text-primary inline-flex cursor-pointer list-none items-center gap-2 font-medium">
        <span>
          {compact ? row.playedMatches : `${row.playedMatches}/${row.totalMatches}`}
        </span>
        {compact ? null : (
          <span className="text-muted-foreground text-xs">
            {formatPercent(row.attendanceRate)}
          </span>
        )}
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

function ruleToEditablePolicyRow(
  rule: FeeRefundPolicyRule,
  index: number,
): EditableRefundPolicyRow {
  return {
    id: `rule-${index}`,
    fromPercent: String(rule.fromPercent),
    toPercent: String(rule.toPercent),
    refundPercent: String(rule.refundPercent),
  };
}

function isCostActiveInPeriod(cost: FeeCalculatorCost, period: string) {
  if (cost.repeatsMonthly) {
    return period >= cost.startPeriod && period <= cost.endPeriod;
  }

  return period === cost.startPeriod;
}

function getRepeatablePeriods(period: string) {
  return Array.from({ length: 11 }, (_, index) => addMonths(period, index + 1));
}

function addMonths(period: string, monthsToAdd: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getUnitLabel(type: FeeCalculatorCostType) {
  if (type === "court") {
    return "Canchas";
  }

  if (type === "coach") {
    return "Horas";
  }

  return "Cantidad";
}

function getForecastLabel(type: FeeCalculatorCostType) {
  if (type === "court") {
    return "Canchas pronosticadas";
  }

  if (type === "coach") {
    return "Horas previstas";
  }

  return "Cantidad estimada";
}

function getActualLabel(type: FeeCalculatorCostType) {
  if (type === "court") {
    return "Canchas reales";
  }

  if (type === "coach") {
    return "Horas reales";
  }

  return "Cantidad real";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPreciseCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 6,
    style: "currency",
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatCurrency(value)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedNumber(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatNumber(value)}`;
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

function formatShortPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "2-digit",
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
