"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const costSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["fixed", "court", "coach", "custom"]),
  startPeriod: periodSchema,
  endPeriod: periodSchema,
  amount: z.coerce.number().min(0),
  repeatsMonthly: z.boolean(),
  splitBetween: z.coerce.number().int().min(1),
  forecastUnits: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

const actualSchema = z.object({
  costId: z.string().trim().min(1),
  period: periodSchema,
  actualUnits: z.coerce.number().min(0),
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

export async function saveFeeCalculatorCost(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = costSchema.parse(input);
  const dataService = getDataService();

  await dataService.upsertFeeCalculatorCost(parsed);
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
          startPeriod: parsed.startPeriod,
          endPeriod: parsed.endPeriod,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

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
