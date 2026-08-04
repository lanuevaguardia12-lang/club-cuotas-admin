"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);
const numericSchema = z.preprocess(parseLocalizedNumberInput, z.number());

const costSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["fixed", "court", "coach", "custom"]),
  period: periodSchema,
  amount: numericSchema.pipe(z.number().min(0)),
  splitBetween: numericSchema.pipe(z.number().int().min(1)),
  assignedPlayerIds: z.array(z.string().trim().min(1)).optional(),
  forecastUnits: numericSchema.pipe(z.number().min(0)),
  notes: z.string().trim().max(500).optional(),
});

const actualSchema = z.object({
  costId: z.string().trim().min(1),
  period: periodSchema,
  actualUnits: numericSchema.pipe(z.number().min(0)),
  actualAmount: numericSchema.pipe(z.number().min(0)).optional(),
  notes: z.string().trim().max(500).optional(),
});

const refundPolicySchema = z.object({
  rules: z
    .array(
      z
        .object({
          fromPercent: z.coerce.number().min(0).max(100),
          toPercent: z.coerce.number().min(0).max(100),
          refundPercent: z.coerce.number().min(0).max(100),
        })
        .refine((rule) => rule.toPercent >= rule.fromPercent, {
          message: "El porcentaje final no puede ser menor al inicial.",
          path: ["toPercent"],
        }),
    )
    .min(1),
});

const calculatorPlayerStatusSchema = z.object({
  playerId: z.string().trim().min(1),
  playerName: z.string().trim().min(2).max(120),
  period: periodSchema,
  status: z.enum(["active", "inactive"]),
  notes: z.string().trim().max(500).optional(),
});

function parseLocalizedNumberInput(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/[^\d,.-]/g, "");

  if (!normalized) {
    return Number.NaN;
  }

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");

    return Number(
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, ""),
    );
  }

  if (hasComma) {
    return Number(normalized.replace(",", "."));
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/\./g, ""));
  }

  return Number(normalized);
}

export async function saveFeeCalculatorCost(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = costSchema.parse(input);
  const dataService = getDataService();
  const monthlyCost = {
    ...parsed,
    startPeriod: parsed.period,
    endPeriod: parsed.period,
    repeatsMonthly: false,
  };

  await dataService.upsertFeeCalculatorCost(monthlyCost);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: parsed.id || parsed.name,
        summary: "Costo del calculador actualizado.",
        metadata: {
          name: parsed.name,
          type: parsed.type,
          period: parsed.period,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");
  revalidatePath("/cash-flow");
  revalidatePath("/");

  return { ok: true };
}

export async function deleteFeeCalculatorCost(costId: string) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const dataService = getDataService();

  await dataService.deleteFeeCalculatorCost(costId);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: costId,
        summary: "Costo del calculador desactivado.",
        metadata: {
          costId,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function resetFeeCalculatorCosts() {
  const user = await getCurrentUser();
  assertPermission(user, "maintenance:manage");

  const dataService = getDataService();

  await dataService.resetFeeCalculatorCosts();
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: "fee-calculator-costs",
        summary: "Costos y cantidades reales del calculador reiniciados.",
        metadata: {
          ranges: "CalculadoraCostos, CalculadoraReales",
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");
  revalidatePath("/");
  revalidatePath("/cash-flow");

  return { ok: true };
}

export async function saveFeeCalculatorActual(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = actualSchema.parse(input);
  const dataService = getDataService();

  await dataService.updateFeeCalculatorActual(parsed);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: `${parsed.costId}:${parsed.period}`,
        summary: "Cantidad real del calculador actualizada.",
        metadata: {
          costId: parsed.costId,
          period: parsed.period,
          actualUnits: parsed.actualUnits,
          actualAmount: parsed.actualAmount ?? null,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function saveFeeRefundPolicy(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = refundPolicySchema.parse(input);
  const dataService = getDataService();

  await dataService.updateFeeRefundPolicy(parsed);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: "refund-policy",
        summary: "Politica de devoluciones actualizada.",
        metadata: {
          rules: parsed.rules.length,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function updateFeeCalculatorPlayerStatus(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = calculatorPlayerStatusSchema.parse(input);
  const dataService = getDataService();

  await dataService.updateFeeCalculatorPlayerStatus(parsed);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "player",
        entityId: `${parsed.playerId}:${parsed.period}`,
        summary: "Estado mensual del jugador actualizado desde el calculador.",
        metadata: {
          name: parsed.playerName,
          period: parsed.period,
          status: parsed.status,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");
  revalidatePath("/");
  revalidatePath("/cash-flow");

  return { ok: true };
}
